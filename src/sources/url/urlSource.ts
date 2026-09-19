/* eslint-disable @typescript-eslint/require-await */
import { type OverrideChange, PluginSource } from '../pluginSource.js'
import { AllPlugins, Plugin, Plugins, UrlPlugin } from '../../pluginList.js'
import { formatSize, output } from '../../utils/output.js'
import { UserError } from '../../errors.js'
import install from './install.js'
import { parseUrlQuery, pinUrl } from './pin.js'
import UrlPluginEntry from './urlPluginEntry.js'

const urlSource: PluginSource<UrlPlugin> = {
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
      output.pluginCard({
        title: id,
        url: plugin.url,
      })
    }
  },
  listEntries(plugins: Plugins): UrlPluginEntry[] {
    return Object.entries(plugins.all.url).map(([id, plugin]) => new UrlPluginEntry(id, plugin.url))
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
    plugins.all.url[id] = { source: 'url', url, version, ...pin }
    output.info(
      `${output.pluginName(id)} ${output.version(version)}: ${pin.filename} (${formatSize(pin.size)}, sha512 ${pin.sha512.slice(0, 8)})`,
    )
    return true
  },
  async update(
    existingPlugins: Plugins,
    newPlugins: Plugins,
  ): Promise<{
    changelog: string
    removed: string[]
    added: string[]
    changed: { identifier: string; oldVersion: string; newVersion: string }[]
    overrides: OverrideChange[]
  }> {
    // URLs have nothing to check for updates, but newPlugins starts empty, so they're carried over as-is
    for (const [id, plugin] of Object.entries(existingPlugins.all.url)) {
      newPlugins.all.url[id] = plugin

      const addedKey = `url:${id}` as const
      if (addedKey in existingPlugins.added) newPlugins.added[addedKey] = existingPlugins.added[addedKey]
    }

    return {
      changelog: '',
      removed: [],
      added: [],
      changed: [],
      overrides: [],
    }
  },
  install,
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all.url[id]
    }
  },
}

export default urlSource
