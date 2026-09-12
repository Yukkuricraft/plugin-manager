import { type Plugins } from '../../pluginList.js'
import ModrinthPluginEntry from './modrinthPluginEntry.js'

export default function listEntries(plugins: Plugins): ModrinthPluginEntry[] {
  const modrinthPlugins = Object.entries(plugins.all.modrinth)
  const nameById = new Map(modrinthPlugins.map(([id, p]) => [id, p.slug ?? id]))

  return modrinthPlugins.map(([id, plugin]) => {
    const added = plugin.slug !== null && `modrinth:${plugin.slug}` in plugins.added
    const requiredBy = [...plugin.dependedOnBy].map((d) => nameById.get(d) ?? d).sort()
    return new ModrinthPluginEntry(plugin.slug ?? id, added, plugin, requiredBy)
  })
}
