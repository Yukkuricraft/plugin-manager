import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import addPlugins from './commands/addPlugins.js'
import installPlugins from './commands/installPlugins.js'
import removePlugins from './commands/removePlugins.js'
import searchPlugins from './commands/searchPlugins.js'
import updatePlugins from './commands/updatePlugins.js'
import viewPlugins from './commands/viewPlugins.js'
import { MissingDataError, RequestError, UserError, ValidationError } from './errors.js'
import { output } from './utils/output.js'

const pluginSourceDescription =
  'By default, Modrinth is used as a plugin source. This can be made explicit by prefixing the plugin with "modrinth:". You can also prefix the plugin with "url:" to use a URLs instead.'
const urlSyntaxDescription = 'When adding a plugin from an URL, the correct syntax is "url:<identifier>@<url>"'

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
    'add <plugin..>',
    'Add plugins',
    (yargs) =>
      yargs.positional('plugin', {
        type: 'string',
        describe: `Plugin to add. Must be Modrinth slug or id. ${pluginSourceDescription} ${urlSyntaxDescription}`,
        array: true,
        demandOption: true,
      }),
    (argv) => addPlugins(argv.plugin),
  )
  .command(
    'view <plugin..>',
    'View information about existing plugins',
    (yargs) =>
      yargs.positional('plugin', {
        type: 'string',
        describe: `Plugin to get info about. ${pluginSourceDescription}`,
        demandOption: true,
        array: true,
      }),
    (argv) => viewPlugins(argv.plugin),
  )
  .command(
    'remove <plugin..>',
    'Remove plugins',
    (yargs) =>
      yargs.positional('plugin', {
        type: 'string',
        describe: `The plugin to remove. ${pluginSourceDescription}`,
        array: true,
        demandOption: true,
      }),
    (argv) => removePlugins(argv.plugin),
  )
  .command('install', 'Install plugins', {}, () => installPlugins())
  .command('update', 'Update plugins', {}, () => updatePlugins())
  .completion()
  .help()
  .recommendCommands()
  .version()
  .fail((msg, err, yargs) => {
    if (msg) {
      console.error(msg)
    }
    if (
      err instanceof ValidationError ||
      err instanceof UserError ||
      err instanceof RequestError ||
      err instanceof MissingDataError
    ) {
      output.error(err.message)
    } else {
      console.error(yargs.help())
      console.error(err)
    }
    process.exit(1)
  })
  .parseAsync(hideBin(process.argv))
