import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import addPlugins from './commands/addPlugins.js'
import installPlugins from './commands/installPlugins.js'
import removePlugins from './commands/removePlugins.js'
import searchPlugins from './commands/searchPlugins.js'
import updatePlugins from './commands/updatePlugins.js'
import viewPlugins from './commands/viewPlugins.js'

await yargs()
  .scriptName('plugins')
  .usage('$0 <cmd> [args]')
  .command(
    'search <plugin>',
    'Search for plugins',
    (yargs) => yargs.positional('plugin', { type: 'string', describe: 'Query to search with', demandOption: true }),
    (argv) => searchPlugins(argv.plugin),
  )
  .command(
    'add <plugin...>',
    'Add plugins',
    (yargs) =>
      yargs.positional('plugin', {
        type: 'string',
        describe: 'Plugin to add. Must be Modrinth slug or id',
        array: true,
        demandOption: true,
      }),
    (argv) => addPlugins(argv.plugin),
  )
  .command(
    'view <plugin...>',
    'View information about existing plugins',
    (yargs) =>
      yargs.positional('plugin', {
        type: 'string',
        describe: 'Plugin to get info about',
        demandOption: true,
        array: true,
      }),
    (argv) => viewPlugins(argv.plugin),
  )
  .command(
    'remove <plugin...>',
    'Remove plugins',
    (yargs) =>
      yargs.positional('plugin', { type: 'string', describe: 'The plugin to remove', array: true, demandOption: true }),
    (argv) => removePlugins(argv.plugin),
  )
  .command('install', 'Install plugins', {}, () => installPlugins())
  .command('update', 'Update plugins', {}, () => updatePlugins())
  .completion()
  .help()
  .recommendCommands()
  .version()
  .parseAsync(hideBin(process.argv))
