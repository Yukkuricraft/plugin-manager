import { getPluginSource } from '../sources/pluginSource.js'

export default async function searchPlugins(query: string) {
  const { source, strippedQuery } = getPluginSource(query)
  await source.search(strippedQuery)
}
