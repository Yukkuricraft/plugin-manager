import { posix } from 'node:path'

import { UserError, ValidationError } from '../../errors.js'
import { type Plugins } from '../../pluginList.js'
import { type DownloadPin, inspectDownload, validateUrl } from '../../utils/files.js'
import { hostHeaders } from './hostHeaders.js'

const syntax = 'url:<id>@<version>@<url>'

/**
 * Splits what follows "url:" in `add` into the ID, version and URL. It's split at the first two @s, so the URL can
 * contain @ but the ID and version can't.
 */
export function parseUrlQuery(query: string): { id: string; version: string; url: string } {
  const first = query.indexOf('@')
  const second = first === -1 ? -1 : query.indexOf('@', first + 1)
  const id = query.slice(0, first)
  const version = query.slice(first + 1, second)
  const url = query.slice(second + 1)
  if (second === -1 || !id || !version || !url) {
    throw new ValidationError(`Expected ${syntax}, got url:${query}`)
  }
  validateUrl(url)
  return { id, version, url }
}

/** Where a url entry's file lands, relative to the plugins folder */
export function installedPath(filename: string, installPath?: string): string {
  return installPath ? posix.join(installPath, filename) : filename
}

/** Names the plugin, other than url entry `id`, whose file lands at `target`, in the form remove takes */
function pathOwner(plugins: Plugins, target: string, id: string): string | undefined {
  const modrinth = Object.entries(plugins.all.modrinth).find(([, entry]) => entry.filename === target)
  if (modrinth) return `modrinth:${modrinth[1].slug ?? modrinth[0]}`

  const url = Object.entries(plugins.all.url).find(
    ([otherId, entry]) => otherId !== id && installedPath(entry.filename, entry.overrides?.path) === target,
  )
  return url ? `url:${url[0]}` : undefined
}

/**
 * Downloads `url` and returns what url entry `id` pins about it. Refuses a file that would land where another
 * plugin's already does, since one would overwrite the other.
 */
export async function pinUrl(plugins: Plugins, id: string, url: string, installPath?: string): Promise<DownloadPin> {
  const pin = await inspectDownload(url, hostHeaders, id)
  const target = installedPath(pin.filename, installPath)
  const owner = pathOwner(plugins, target, id)
  if (owner) throw new UserError(`${url} would be installed to ${target}, which ${owner} already uses`)
  return pin
}
