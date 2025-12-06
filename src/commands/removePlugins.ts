import { loadPlugins, writePlugins } from '../pluginList.js'
import { getPluginSource, PluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'

export default async function removePlugins(pluginsToRemove: string[]) {
  const plugins = await loadPlugins()
  const toRemove = pluginsToRemove.map((p) => {
    const { source, strippedQuery } = getPluginSource(p)
    const plugin = source.findPlugin(strippedQuery, plugins.all)
    return { source, identifier: strippedQuery, plugin }
  })
  const notFound = toRemove.filter(({ plugin }) => plugin === null)
  if (notFound.length > 0) {
    throw new Error(`Could not find plugins ${notFound.map(({ identifier }) => identifier).join(', ')}`)
  }

  const sources = new Set<PluginSource>()
  toRemove.forEach(({ source, identifier, plugin }) => {
    if (plugin === null) throw new Error('Plugin is null')
    delete plugins.added[`${source.prefix}:${identifier}`]
    sources.add(source)
  })

  sources.forEach((source) =>
    source.removePlugin(
      plugins,
      toRemove.map(({ plugin }) => plugin!),
    ),
  )

  await writePlugins(plugins)
  await installPlugins()
}
