import chalk from 'chalk'

import { loadPlugins } from '../pluginList.js'
import { allPluginSources } from '../sources/pluginSource.js'

export default async function installPlugins() {
  const plugins = await loadPlugins()
  console.log(chalk.blue('Downloading plugins...'))

  for (const source of allPluginSources) {
    await source.install(plugins.all)
  }

  console.log()
  console.log(chalk.green('Done!'))
}
