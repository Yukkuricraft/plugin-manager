import * as prompts from '@inquirer/prompts'

import { loadPlugins, writePlugins } from '../pluginList.js'
import { type AddFlags, getPluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'
import { output } from '../utils/output.js'

export default async function addPlugins(pluginsPath: string, pluginIndicators: string[], flags: AddFlags) {
  const plugins = await loadPlugins(pluginsPath)

  let changed = false
  for (const pluginIndicator of pluginIndicators) {
    const { source, strippedQuery } = getPluginSource(pluginIndicator)
    // Explicitly not parallel
    if (await source.addPlugin(plugins, strippedQuery, flags)) changed = true
  }
  output.blank()

  // Every plugin was already added as asked, so there's nothing to confirm, write or install
  if (!changed) return

  const accept = await prompts.confirm({
    message: 'Continue?',
  })
  if (!accept) return

  await writePlugins(plugins, pluginsPath)
  output.blank()
  await installPlugins(pluginsPath)
}
