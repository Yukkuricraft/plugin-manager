import { loadPlugins } from '../pluginList.js'
import { type ResolutionFlags, searchTarget } from '../resolution.js'
import { getPluginSource } from '../sources/pluginSource.js'

export default async function searchPlugins(query: string, flags: ResolutionFlags & { anyGameVersion?: boolean }) {
  const { config } = await loadPlugins()
  const { loader, gameVersion } = searchTarget(config, flags)

  const { source, strippedQuery } = getPluginSource(query)
  await source.search(strippedQuery, loader, gameVersion)
}
