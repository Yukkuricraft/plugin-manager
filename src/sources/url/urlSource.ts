/* eslint-disable @typescript-eslint/require-await */
import { PluginSource } from '../pluginSource.js'
import { AllPlugins, Plugin, Plugins, UrlPlugin } from '../../pluginList.js'
import { output } from '../../utils/output.js'
import { downloadFile, validateUrl } from '../../utils/files.js'
import { UserError, ValidationError } from '../../errors.js'

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
  async addPlugin(plugins: Plugins, pluginIndicator: string): Promise<boolean> {
    const parts = pluginIndicator.split('@')
    if (parts.length !== 2) throw new ValidationError('Invalid URL format')
    const [id, url] = parts
    validateUrl(url)

    if (plugins.added[`url:${id}`] === url) {
      output.info(`Plugin ${output.pluginName(id)} already in added list with the specified URL. Exiting early`)
      return false
    }

    plugins.added[`url:${id}`] = url
    plugins.all.url[id] = {
      source: 'url' as const,
      url,
    }
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
    }
  },
  async install(plugins: AllPlugins): Promise<void> {
    await Promise.all(Object.entries(plugins.url).map(([id, plugin]) => downloadFile(plugin.url, { id })))
  },
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all.url[id]
    }
  },
}

export default urlSource
