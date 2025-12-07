import { loadPlugins, type Plugin } from '../pluginList.js'
import { getPluginSource, PluginSource } from '../sources/pluginSource.js'
import { SanityCheckError, UserError } from '../errors.js'

export default async function viewPlugins(plugins: string[]) {
  const pluginsMap = await loadPlugins()

  const resolvedPlugins = plugins.map((p) => {
    const { source, strippedQuery } = getPluginSource(p)
    const pluginWithId = source.findPlugin(strippedQuery, pluginsMap.all)
    return { source, lookedFor: strippedQuery, pluginWithId }
  })

  const notFoundPlugins = resolvedPlugins.filter(({ pluginWithId }) => pluginWithId === null)
  if (notFoundPlugins.length > 0) {
    throw new UserError(`Plugins ${notFoundPlugins.map(({ lookedFor }) => lookedFor).join(', ')} not found`)
  }

  const sources = new Map<PluginSource, { plugin: Plugin; id: string }[]>()
  resolvedPlugins.forEach(({ source, pluginWithId }) => {
    if (pluginWithId === null) throw new SanityCheckError('Plugin is null')

    const existing = sources.get(source) ?? []
    existing.push(pluginWithId)
    if (!sources.has(source)) sources.set(source, existing)
  })

  const entries = [...sources.entries()]
  for (let i = 0; i < entries.length; i++) {
    const [source, plugins] = entries[i]
    await source.viewPlugins(plugins, i === entries.length - 1)
  }
}
