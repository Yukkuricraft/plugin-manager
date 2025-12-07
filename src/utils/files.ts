import { createWriteStream, createReadStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { output } from './output.js'
import contentDisposition from 'content-disposition'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { RequestError, ValidationError } from '../errors.js'

export async function downloadFile(
  url: string,
  data: {
    id: string
    filename?: string
    sha1?: string
    sha512?: string
  },
) {
  validateUrl(url)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new RequestError(`Failed to download ${url}`)

  let usedFilename = data.filename
  if (!usedFilename) {
    const filenameHeader = res.headers.get('Content-Disposition')
    const contentDispositionData = filenameHeader === null ? null : contentDisposition.parse(filenameHeader)
    usedFilename = contentDispositionData?.parameters?.filename ?? `${data.id}.jar`
  }

  if (usedFilename !== path.basename(usedFilename) || usedFilename.includes('..') || usedFilename.startsWith('.')) {
    throw new ValidationError(`Invalid filename ${usedFilename}`)
  }

  const fileStream = createWriteStream(`./managedPlugins/${usedFilename}`)
  await finished(Readable.fromWeb(res.body as ReadableStream).pipe(fileStream))
  output.file(usedFilename, 'downloaded')

  if (data.sha512 || data.sha1) {
    const hashes = await fileHash(`./managedPlugins/${usedFilename}`)
    if (data.sha512 && data.sha512 !== hashes.sha512) {
      throw new ValidationError(`SHA512 hash mismatch for ${usedFilename}`)
    }
    if (data.sha1 && data.sha1 !== hashes.sha1) {
      throw new ValidationError(`SHA1 hash mismatch for ${usedFilename}`)
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
