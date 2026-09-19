import { createWriteStream, createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
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

  let usedFilename = data.filename
  if (!usedFilename) {
    const filenameHeader = res.headers.get('Content-Disposition')
    const contentDispositionData = filenameHeader === null ? null : contentDisposition.parse(filenameHeader)
    usedFilename = contentDispositionData?.parameters?.filename ?? `${data.id}.jar`
  }

  if (usedFilename !== path.basename(usedFilename) || usedFilename.includes('..') || usedFilename.startsWith('.')) {
    throw new ValidationError(`Invalid filename ${usedFilename}`)
  }

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
