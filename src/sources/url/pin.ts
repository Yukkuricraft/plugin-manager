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

/** Names the plugin, other than url entry `id`, that's saved as `filename`, in the form remove takes */
function filenameOwner(plugins: Plugins, filename: string, id: string): string | undefined {
  const modrinth = Object.entries(plugins.all.modrinth).find(([, entry]) => entry.filename === filename)
  if (modrinth) return `modrinth:${modrinth[1].slug ?? modrinth[0]}`

  const url = Object.entries(plugins.all.url).find(([otherId, entry]) => otherId !== id && entry.filename === filename)
  return url ? `url:${url[0]}` : undefined
}

/**
 * Downloads `url` and returns what url entry `id` pins about it. Refuses a filename another plugin in `plugins`
 * already uses, since both would be saved to the plugins folder under the same name.
 */
export async function pinUrl(plugins: Plugins, id: string, url: string): Promise<DownloadPin> {
  const pin = await inspectDownload(url, hostHeaders, id)
  const owner = filenameOwner(plugins, pin.filename, id)
  if (owner) throw new UserError(`${url} would be saved as ${pin.filename}, which ${owner} already uses`)
  return pin
}
