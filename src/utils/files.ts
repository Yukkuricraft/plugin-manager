import { createWriteStream, createReadStream } from 'node:fs'
import { readdir, rm, rmdir } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { output } from './output.js'
import contentDisposition from 'content-disposition'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { HashMismatchError, RequestError, UserError, ValidationError } from '../errors.js'

/** What a download sends to one host, beyond a plain GET */
export interface HostHeaders {
  /** Headers for a request to this host. Called for each request, so environment variables are only read when needed */
  headers(): Record<string, string>
  /** Added to a 401, 403 or 404 from this host, to say what's probably missing */
  help?: string
}

/** HostHeaders for each host that needs them, keyed by `URL.host`: lowercase, with the port if it isn't the default */
export type HostTable = Record<string, HostHeaders>

const maxRedirects = 5

/**
 * Fetches `url`, following redirects itself so that each request is sent only the headers `hosts` has for that
 * request's host. A redirect to a host with no entry, such as a signed download URL on another domain, is sent no
 * headers at all. fetch's own redirect handling would drop Authorization on a redirect to another host, but forward
 * every other header.
 *
 * Returns the final response, which is OK and has a body. Throws a RequestError for anything else, and a UserError
 * rather than send a host its headers over plain http.
 */
export async function fetchWithAuth(url: string, hosts: HostTable = {}): Promise<Response> {
  let current = new URL(url)
  for (let redirects = 0; ; redirects++) {
    const entry = hosts[current.host]
    if (entry && current.protocol !== 'https:') {
      throw new UserError(`Refusing to send ${current.host} its headers over ${current.protocol}. Use an https URL`)
    }

    const res = await fetch(current, { headers: entry?.headers() ?? {}, redirect: 'manual' })

    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      if (redirects === maxRedirects) throw new RequestError(`Too many redirects downloading ${url}`)
      await res.body?.cancel()
      current = new URL(location, current)
      continue
    }

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      const help = entry?.help ? `. ${entry.help}` : ''
      throw new RequestError(`${current.host} answered ${res.status} for ${url}${help}`)
    }
    if (!res.ok || !res.body) throw new RequestError(`Failed to download ${url} (${res.status})`)
    return res
  }
}

/**
 * The name to save a download under when nothing else gives one: the server's Content-Disposition filename, then the
 * last segment of the URL the response came from if it ends in .jar, then `<fallbackName>.jar`
 */
function responseFilename(res: Response, fallbackName: string): string {
  const header = res.headers.get('Content-Disposition')
  // A malformed header is a server's mistake, not ours to crash on: fall through to the next rule instead
  let fromHeader: string | undefined
  try {
    fromHeader = header === null ? undefined : contentDisposition.parse(header).parameters?.filename
  } catch {
    fromHeader = undefined
  }
  if (fromHeader) return fromHeader

  // A segment with an invalid escape (e.g. %zz) can't be decoded; treat it as no usable segment
  let lastSegment = ''
  try {
    lastSegment = res.url ? decodeURIComponent(new URL(res.url).pathname.split('/').pop() ?? '') : ''
  } catch {
    lastSegment = ''
  }
  return lastSegment.endsWith('.jar') ? lastSegment : `${fallbackName}.jar`
}

/** Throws unless `filename` is a plain file name, so a server can't make a download land outside its directory */
function checkFilename(filename: string) {
  if (filename !== path.basename(filename) || filename.includes('..') || filename.startsWith('.')) {
    throw new ValidationError(`Invalid filename ${filename}`)
  }
}

export async function downloadFile(
  url: string,
  dir: string,
  data: {
    id: string
    filename?: string
    sha1?: string
    sha512?: string
    /** Headers to send per host. See fetchWithAuth */
    hosts?: HostTable
  },
) {
  validateUrl(url)
  const res = await fetchWithAuth(url, data.hosts)

  const usedFilename = data.filename ?? responseFilename(res, data.id)
  checkFilename(usedFilename)

  const target = path.join(dir, usedFilename)
  const fileStream = createWriteStream(target)
  await finished(Readable.fromWeb(res.body as ReadableStream).pipe(fileStream))
  output.file(usedFilename, 'downloaded')

  if (data.sha512 || data.sha1) {
    const hashes = await fileHash(target)
    const matches = (!data.sha512 || data.sha512 === hashes.sha512) && (!data.sha1 || data.sha1 === hashes.sha1)
    if (!matches) {
      // Deleted so that nothing, such as a later install, mistakes it for the file that was expected
      await rm(target, { force: true })
      throw new HashMismatchError(`Hash mismatch for ${usedFilename}`)
    }
  }
}

/** What a url entry pins about the file at its URL */
export interface DownloadPin {
  filename: string
  sha512: string
  size: number
}

// Every JAR is a ZIP file, and every ZIP file starts with these bytes
const jarSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04])

/**
 * Downloads `url` without saving it, and returns what a url entry pins: the name it'll be saved under, its sha512 and
 * its size. Throws unless it's a JAR, so an error page, or an API's JSON description of a file, is never pinned.
 */
export async function inspectDownload(url: string, hosts: HostTable, fallbackName: string): Promise<DownloadPin> {
  validateUrl(url)
  const res = await fetchWithAuth(url, hosts)
  const filename = responseFilename(res, fallbackName)
  checkFilename(filename)

  const hash = createHash('sha512')
  let size = 0
  let start = Buffer.alloc(0)
  for await (const chunk of Readable.fromWeb(res.body as ReadableStream)) {
    const bytes = chunk as Uint8Array
    if (start.length < jarSignature.length) start = Buffer.concat([start, bytes]).subarray(0, jarSignature.length)
    hash.update(bytes)
    size += bytes.length
  }

  if (!start.equals(jarSignature)) {
    // An API that needs an Accept header before it serves a file tends to describe the file in JSON instead
    const json =
      start[0] === 0x7b
        ? ' It returned JSON, which APIs send when they need an Accept header to serve the file itself. Add the host to src/sources/url/hostHeaders.ts'
        : ''
    throw new UserError(`${url} didn't return a JAR.${json}`)
  }
  return { filename, sha512: hash.digest('hex'), size }
}

export function fileHash(file: string) {
  return new Promise<{ sha1: string; sha512: string }>((resolve, reject) => {
    const sha1 = createHash('sha1')
    const sha512 = createHash('sha512')
    sha1.setEncoding('hex')
    sha512.setEncoding('hex')

    const stream = createReadStream(file)
    stream.pipe(sha1)
    stream.pipe(sha512)

    stream.once('error', reject)

    stream.once('end', () => {
      resolve({
        sha1: sha1.read() as string,
        sha512: sha512.read() as string,
      })
    })
  })
}

/**
 * Everything under `dir` that isn't a directory, as a / separated path relative to `dir`, sorted. A symlink is
 * included, since dropping it would leave it neither deleted by reconciliation nor accounted for. Directories are
 * left out, so an empty one doesn't appear in the listing.
 */
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
}

/** Removes every empty directory under `dir`, deepest first, so one left holding only empty directories goes too */
export async function pruneEmptyDirs(dir: string): Promise<void> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((a, b) => b.length - a.length)

  for (const candidate of dirs) {
    try {
      await rmdir(candidate)
    } catch (e) {
      // A directory holding a file reports ENOTEMPTY on Linux, macOS and Windows, and EEXIST on some other POSIX filesystems
      const tolerated = typeof e === 'object' && e && 'code' in e && (e.code === 'ENOTEMPTY' || e.code === 'EEXIST')
      if (!tolerated) throw e
    }
  }
}

export function validateUrl(url: string) {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch (e) {
    throw new ValidationError('Invalid URL format')
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ValidationError('Only HTTP and HTTPS URLs are supported')
  }
}
