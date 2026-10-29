import { type Plugins } from '../../pluginList.js'
import ModrinthPluginEntry from './modrinthPluginEntry.js'

export default function listEntries(plugins: Plugins): ModrinthPluginEntry[] {
  const modrinthPlugins = Object.entries(plugins.all.modrinth)
  const nameById = new Map(modrinthPlugins.map(([id, p]) => [id, p.slug ?? id]))
  // Keyed by a substitute's project ID, holding the slug of the project it replaces
  const replacedSlugBySubstituteId = new Map(
    Object.values(plugins.config.substitutes ?? {})
      .filter((r) => r.substituteSource === 'modrinth')
      .map((r) => [r.substitute, r.slug]),
  )

  return modrinthPlugins.map(([id, plugin]) => {
    const added = plugin.slug !== null && `modrinth:${plugin.slug}` in plugins.added
    const requiredBy = [...plugin.dependedOnBy].map((d) => nameById.get(d) ?? d).sort()
    return new ModrinthPluginEntry(plugin.slug ?? id, added, plugin, requiredBy, replacedSlugBySubstituteId.get(id))
  })
}
