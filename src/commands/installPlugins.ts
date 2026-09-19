import fs from 'fs/promises'

import { assertNoSubstitutedPluginsLocked, loadPlugins } from '../pluginList.js'
import { allPluginSources } from '../sources/pluginSource.js'
import { output } from '../utils/output.js'

export default async function installPlugins() {
  const plugins = await loadPlugins()
  // Before the plugins folder is cleared, so a refused install leaves the server's current plugins in place
  assertNoSubstitutedPluginsLocked(plugins)
  output.download('Downloading plugins...')

  await fs.rm('./plugins', { recursive: true, force: true })
  await fs.mkdir('./managedPlugins', { recursive: true })
  await fs.mkdir('./unmanagedPlugins', { recursive: true })

  for (const source of allPluginSources) {
    await source.install(plugins.all)
  }

  output.blank()
  output.info('Reconstructing plugins folder')

  await fs.cp('./managedPlugins', './plugins', { recursive: true, force: true })
  await fs.cp('./unmanagedPlugins', './plugins', { recursive: true, force: true })

  output.blank()
  output.success('Installation complete!')
}
