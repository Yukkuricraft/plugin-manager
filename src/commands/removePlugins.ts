import { loadPlugins, type Plugin, type Plugins, writePlugins } from '../pluginList.js'
import { getPluginSource, PluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'
import { SanityCheckError, UserError } from '../errors.js'

export default async function removePlugins(pluginsPath: string, pluginsToRemove: string[]) {
  const plugins = await loadPlugins(pluginsPath)

  // One at a time, since an ambiguous name prompts the user
  const toRemove = []
  for (const p of pluginsToRemove) {
    const { source, strippedQuery } = getPluginSource(p)
    const pluginAndId = await source.findPlugin(strippedQuery, plugins.all)
    toRemove.push({ source, identifier: strippedQuery, pluginAndId })
  }
  const notFound = toRemove.filter(({ pluginAndId }) => pluginAndId === null)
  if (notFound.length > 0) {
    throw new UserError(`Could not find plugins ${notFound.map(({ identifier }) => identifier).join(', ')}`)
  }

  const sources = new Map<PluginSource, { plugin: Plugin; id: string }[]>()
  toRemove.forEach(({ source, pluginAndId }) => {
    if (pluginAndId === null) throw new SanityCheckError('Plugin is null')

    // Keyed off the matched plugin rather than the query, which may be a partial or differently cased slug
    const { plugin, id } = pluginAndId
    const addedKey: keyof Plugins['added'] = plugin.source === 'modrinth' ? `modrinth:${plugin.slug}` : `url:${id}`
    delete plugins.added[addedKey]

    const existing = sources.get(source) ?? []
    existing.push(pluginAndId)
    if (!sources.has(source)) sources.set(source, existing)
  })

  sources.forEach((toRemoveFromSource, source) => source.removePlugin(plugins, toRemoveFromSource))

  await writePlugins(plugins, pluginsPath)
  await installPlugins(pluginsPath)
}
