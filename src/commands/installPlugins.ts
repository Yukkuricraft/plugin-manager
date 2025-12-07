import chalk from 'chalk'
import fs from 'fs/promises'

import { loadPlugins } from '../pluginList.js'
import { allPluginSources } from '../sources/pluginSource.js'

export default async function installPlugins() {
  const plugins = await loadPlugins()
  console.log(chalk.blue('Downloading plugins...'))

  await fs.rm('./plugins', { recursive: true, force: true })
  await fs.mkdir('./managedPlugins', { recursive: true })
  await fs.mkdir('./unmanagedPlugins', { recursive: true })

  for (const source of allPluginSources) {
    await source.install(plugins.all)
  }

  console.log()
  console.log(chalk.green('Done downloading! Reconstructing plugins folder'))

  await fs.cp('./managedPlugins', './plugins', { recursive: true, force: true })
  await fs.cp('./unmanagedPlugins', './plugins', { recursive: true, force: true })

  console.log()
  console.log(chalk.green('Done!'))
}
