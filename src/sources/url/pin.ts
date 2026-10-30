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

type PinSelf = { source: 'url' | 'gh-release'; id: string }

/** Names the plugin, other than `self`, that's saved as `filename`, in the form remove takes */
function filenameOwner(plugins: Plugins, filename: string, self: PinSelf): string | undefined {
  const modrinth = Object.entries(plugins.all.modrinth).find(([, entry]) => entry.filename === filename)
  if (modrinth) return `modrinth:${modrinth[1].slug ?? modrinth[0]}`

  for (const source of ['url', 'gh-release'] as const) {
    const pinned: Record<string, { filename: string }> = plugins.all[source]
    const match = Object.entries(pinned).find(
      ([id, entry]) => !(source === self.source && id === self.id) && entry.filename === filename,
    )
    if (match) return `${source}:${match[0]}`
  }
  return undefined
}

/**
 * Downloads `url` and returns what the `self` entry pins about it. Refuses a filename another plugin in `plugins`
 * already uses, since both would be saved to the plugins folder under the same name.
 */
export async function pinUrl(plugins: Plugins, self: PinSelf, url: string): Promise<DownloadPin> {
  const pin = await inspectDownload(url, hostHeaders, self.id)
  const owner = filenameOwner(plugins, pin.filename, self)
  if (owner) throw new UserError(`${url} would be saved as ${pin.filename}, which ${owner} already uses`)
  return pin
}
