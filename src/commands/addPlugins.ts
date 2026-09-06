import * as prompts from '@inquirer/prompts'

import { loadPlugins, writePlugins } from '../pluginList.js'
import { type Loader } from '../sources/modrinth/loaders.js'
import { getPluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'
import { output } from '../utils/output.js'

export default async function addPlugins(
  pluginIndicators: string[],
  loader: Loader,
  gameVersion?: string,
  featured?: boolean,
) {
  const plugins = await loadPlugins()

  for (const pluginIndicator of pluginIndicators) {
    const { source, strippedQuery } = getPluginSource(pluginIndicator)
    // Explicitly not parallel
    await source.addPlugin(plugins, strippedQuery, loader, gameVersion, featured)
  }
  output.blank()

  const accept = await prompts.confirm({
    message: 'Continue?',
  })
  if (!accept) return

  await writePlugins(plugins)
  output.blank()
  await installPlugins()
}
