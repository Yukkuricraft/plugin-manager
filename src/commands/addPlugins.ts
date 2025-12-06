import * as prompts from '@inquirer/prompts'

import { loadPlugins, writePlugins } from '../pluginList.js'
import { getPluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'

export default async function addPlugins(pluginIndicators: string[], gameVersion?: string, featured?: boolean) {
  const plugins = await loadPlugins()

  for (const pluginIndicator of pluginIndicators) {
    const { source, strippedQuery } = getPluginSource(pluginIndicator)
    // Explicitly not parallel
    await source.addPlugin(plugins, strippedQuery, gameVersion, featured)
  }

  const contine = await prompts.confirm({
    message: 'Continue?',
  })
  if (!contine) return

  await writePlugins(plugins)
  await installPlugins()
}
