import { loadPlugins, writePlugins } from '../pluginList.js'
import { getPluginSource, PluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'
import { SanityCheckError, UserError } from '../errors.js'

export default async function removePlugins(pluginsToRemove: string[]) {
  const plugins = await loadPlugins()
  const toRemove = pluginsToRemove.map((p) => {
    const { source, strippedQuery } = getPluginSource(p)
    const plugin = source.findPlugin(strippedQuery, plugins.all)
    return { source, identifier: strippedQuery, pluginAndId: plugin }
  })
  const notFound = toRemove.filter(({ pluginAndId }) => pluginAndId === null)
  if (notFound.length > 0) {
    throw new UserError(`Could not find plugins ${notFound.map(({ identifier }) => identifier).join(', ')}`)
  }

  const sources = new Set<PluginSource>()
  toRemove.forEach(({ source, identifier, pluginAndId }) => {
    if (pluginAndId === null) throw new SanityCheckError('Plugin is null')
    delete plugins.added[`${source.prefix}:${identifier}`]
    sources.add(source)
  })

  sources.forEach((source) =>
    source.removePlugin(
      plugins,
      toRemove.map(({ pluginAndId }) => pluginAndId!),
    ),
  )

  await writePlugins(plugins)
  await installPlugins()
}
