import { type Loader } from '../sources/modrinth/loaders.js'
import { getPluginSource } from '../sources/pluginSource.js'

export default async function searchPlugins(query: string, loader: Loader, gameVersion?: string) {
  const { source, strippedQuery } = getPluginSource(query)
  await source.search(strippedQuery, loader, gameVersion)
}
