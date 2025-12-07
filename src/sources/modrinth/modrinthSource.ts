import { AllPlugins, ModrinthPlugin } from '../../pluginList.js'
import { type PluginSource } from '../pluginSource.js'
import addPlugin from './addPlugin.js'
import install from './install.js'
import removePlugin from './removePlugin.js'
import search from './search.js'
import update from './update.js'
import viewPlugins from './viewPlugins.js'

const modrinthSource: PluginSource<ModrinthPlugin> = {
  prefix: 'modrinth' as const,
  findPlugin(query: string, plugins: AllPlugins): { plugin: ModrinthPlugin; id: string } | null {
    for (const id in plugins.modrinth) {
      const plugin = plugins.modrinth[id]

      if (plugin.slug?.toLowerCase()?.includes(query.toLowerCase())) {
        return { plugin, id }
      }
    }

    return null
  },
  search,
  viewPlugins,
  addPlugin,
  update,
  install,
  removePlugin,
}

export default modrinthSource
