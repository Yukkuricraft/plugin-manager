/* eslint-disable @typescript-eslint/require-await */
import type { PluginSource } from '../pluginSource.js'
import { AllPlugins, Plugin, Plugins, UrlPlugin } from '../../pluginList.js'
import { formatSize, output } from '../../utils/output.js'
import { UserError } from '../../errors.js'
import install from './install.js'
import { parseUrlQuery, pinUrl } from './pin.js'
import update from './update.js'
import UrlPluginEntry from './urlPluginEntry.js'

// `satisfies` (rather than a `: PluginSource<UrlPlugin>` annotation) keeps `listEntries`'s inferred
// `UrlPluginEntry[]` return type, so callers can read `.substitutes` off the result.
const urlSource = {
  prefix: 'url',
  async findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: UrlPlugin; id: string } | null> {
    const plugin = plugins.url[query]
    return plugin ? { plugin, id: query } : null
  },
  search(): Promise<void> {
    throw new UserError('Search is not possible for URLs')
  },
  async viewPlugins(plugins: { plugin: UrlPlugin; id: string }[]): Promise<void> {
    for (const { plugin, id } of plugins) {
      new UrlPluginEntry(id, plugin).printVerbose()
    }
  },
  listEntries(plugins: Plugins): UrlPluginEntry[] {
    // Keyed by a url substitute's plugin ID, holding the slug of the project it replaces
    const replacedSlugById = new Map(
      Object.values(plugins.config.substitutes ?? {})
        .filter((r) => r.substituteSource === 'url')
        .map((r) => [r.substitute, r.slug]),
    )
    return Object.entries(plugins.all.url).map(
      ([id, plugin]) => new UrlPluginEntry(id, plugin, replacedSlugById.get(id)),
    )
  },
  async addPlugin(plugins: Plugins, pluginIndicator: string): Promise<boolean> {
    const { id, version, url } = parseUrlQuery(pluginIndicator)

    const existing = plugins.all.url[id]
    if (existing?.url === url && existing.version === version) {
      output.info(`Plugin ${output.pluginName(id)} is already added with this URL and version. Exiting early`)
      return false
    }

    const pin = await pinUrl(plugins, id, url)
    plugins.added[`url:${id}`] = version
    plugins.all.url[id] = { source: 'url', url, version, ...pin, pinnedAt: new Date().toISOString() }
    output.info(
      `${output.pluginName(id)} ${output.version(version)}: ${pin.filename} (${formatSize(pin.size)}, sha512 ${pin.sha512.slice(0, 8)})`,
    )
    return true
  },
  update,
  install,
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all.url[id]
    }
  },
} satisfies PluginSource<UrlPlugin>

export default urlSource
