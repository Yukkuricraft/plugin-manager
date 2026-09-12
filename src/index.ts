import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import addPlugins from './commands/addPlugins.js'
import installPlugins from './commands/installPlugins.js'
import removePlugins from './commands/removePlugins.js'
import searchPlugins from './commands/searchPlugins.js'
import showPlugins from './commands/showPlugins.js'
import updatePlugins from './commands/updatePlugins.js'
import viewPlugins from './commands/viewPlugins.js'
import { MissingDataError, RequestError, UserError, ValidationError } from './errors.js'
import { allLoaders, desiredLoader } from './sources/modrinth/loaders.js'
import { output } from './utils/output.js'

const pluginSourceDescription =
  'By default, Modrinth is used as a plugin source. This can be made explicit by prefixing the plugin with "modrinth:". You can also prefix the plugin with "url:" to use a URLs instead.'
const urlSyntaxDescription = 'When adding a plugin from an URL, the correct syntax is "url:<identifier>@<url>"'
const gameVersionDescription =
  'Only consider plugin versions supporting this Minecraft version, e.g. "1.21.1". Without it, the newest version is used whichever Minecraft versions it supports. Applies to dependencies too.'
const featuredDescription =
  'Only consider plugin versions the author has marked as featured on Modrinth. Does not apply to dependencies.'
const versionSyntaxDescription =
  'To pin a Modrinth plugin to a specific version, use "<plugin>@<version>". The version must exactly match the Modrinth version number. If omitted, the latest matching version is resolved.'

await yargs()
  .scriptName('plugins')
  .usage('$0 <cmd> [args]')
  .command(
    'search <plugin>',
    'Search for plugins',
    (yargs) =>
      yargs
        .positional('plugin', { type: 'string', describe: 'Query to search with', demandOption: true })
        .option('loader', {
          choices: allLoaders,
          default: desiredLoader,
          describe:
            'Only show plugins that run on this loader, including those built for a loader it is compatible with',
        })
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: 'Only show plugins with a version supporting this Minecraft version, e.g. "1.21.1"',
        }),
    (argv) => searchPlugins(argv.plugin, argv.loader, argv.gameVersion),
  )
  .command(
    'add <plugin..>',
    'Add plugins',
    (yargs) =>
      yargs
        .positional('plugin', {
          type: 'string',
          describe: `Plugin to add. Must be Modrinth slug or id. ${pluginSourceDescription} ${urlSyntaxDescription} ${versionSyntaxDescription}`,
          array: true,
          demandOption: true,
        })
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: gameVersionDescription,
        })
        .option('featured', {
          type: 'boolean',
          describe: featuredDescription,
        }),
    (argv) => addPlugins(argv.plugin, desiredLoader, argv.gameVersion, argv.featured),
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
    'show',
    'Show a summary of all plugins in plugins.json',
    (yargs) =>
      yargs.option('verbose', {
        type: 'boolean',
        alias: 'v',
        describe: 'Show full details for each plugin',
        default: false,
      }),
    (argv) => showPlugins(argv.verbose),
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
  .command(
    'update',
    'Update plugins',
    (yargs) =>
      yargs
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: gameVersionDescription,
        })
        .option('featured', {
          type: 'boolean',
          describe: featuredDescription,
        }),
    (argv) => updatePlugins(desiredLoader, argv.gameVersion, argv.featured),
  )
  .completion()
  .help()
  .recommendCommands()
  .version()
  .fail((msg, err, yargs) => {
    if (
      err instanceof ValidationError ||
      err instanceof UserError ||
      err instanceof RequestError ||
      err instanceof MissingDataError
    ) {
      output.error(err.message)
    } else if (err) {
      // Anything else thrown is a bug rather than a usage mistake, so the help text would only bury it
      console.error(err)
    } else {
      // yargs rejected the arguments themselves
      yargs.showHelp()
      console.error()
      output.error(msg)
    }
    process.exit(1)
  })
  .parseAsync(hideBin(process.argv))
