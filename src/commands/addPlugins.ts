import * as prompts from '@inquirer/prompts'

import { UserError } from '../errors.js'
import { loadPlugins, writePlugins } from '../pluginList.js'
import { type AddFlags, getPluginSource } from '../sources/pluginSource.js'
import installPlugins from './installPlugins.js'
import { output } from '../utils/output.js'

export default async function addPlugins(pluginsPath: string, pluginIndicators: string[], flags: AddFlags) {
  const plugins = await loadPlugins(pluginsPath)

  const sources = pluginIndicators.map((indicator) => ({ indicator, ...getPluginSource(indicator) }))
  if (flags.path !== undefined) {
    const wrongSource = sources.find(({ source }) => source.prefix !== 'url')
    if (wrongSource) {
      throw new UserError(
        `--path only applies to url plugins, and ${wrongSource.indicator} comes from ${wrongSource.source.prefix}`,
      )
    }
  }

  let changed = false
  for (const { source, strippedQuery } of sources) {
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
