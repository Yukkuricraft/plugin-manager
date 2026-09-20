import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import addPlugins from './commands/addPlugins.js'
import initPlugins from './commands/initPlugins.js'
import installPlugins from './commands/installPlugins.js'
import removePlugins from './commands/removePlugins.js'
import searchPlugins from './commands/searchPlugins.js'
import showPlugins from './commands/showPlugins.js'
import substitutePlugins from './commands/substitutePlugins.js'
import updatePlugins from './commands/updatePlugins.js'
import viewPlugins from './commands/viewPlugins.js'
import { MissingDataError, RequestError, UserError, ValidationError } from './errors.js'
import { defaultPluginsPath } from './pluginList.js'
import { allLoaders } from './sources/modrinth/loaders.js'
import { output } from './utils/output.js'

const pluginSourceDescription =
  'By default, Modrinth is used as a plugin source. This can be made explicit by prefixing the plugin with "modrinth:". You can also prefix the plugin with "url:" to use a URLs instead.'
const urlSyntaxDescription =
  'When adding a plugin from a URL, the syntax is "url:<identifier>@<version>@<url>". The version is a label for the file, such as "1.7.3". The file is downloaded once and pinned by its hash.'
const addGameVersionDescription =
  'Resolve against this Minecraft version, e.g. "1.20.4", instead of the one in plugins.json, recording it as an override on the plugin. Applies to dependencies too.'
const updateGameVersionDescription =
  'The Minecraft version to update plugins for, e.g. "1.21.4". Asked for if not given, defaulting to the one in plugins.json, which is then updated to match.'
const featuredDescription =
  'Only consider plugin versions the author has marked as featured on Modrinth. Does not apply to dependencies, and is not remembered between runs.'
const versionSyntaxDescription =
  'To pin a Modrinth plugin to a specific version, use "<plugin>@<version>". The version must exactly match the Modrinth version number. If omitted, the latest matching version is resolved.'

await yargs()
  .scriptName('plugins')
  .usage('$0 <cmd> [args]')
  .command(
    'init',
    'Create plugins.json for a server',
    (yargs) =>
      yargs
        .option('loader', {
          choices: allLoaders,
          describe: 'The loader the server runs. Asked for if not given',
        })
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: 'The Minecraft version the server runs, e.g. "1.21.1". Asked for if not given',
        }),
    (argv) => initPlugins(defaultPluginsPath, { loader: argv.loader, gameVersion: argv.gameVersion }),
  )
  .command(
    'search <plugin>',
    'Search for plugins',
    (yargs) =>
      yargs
        .positional('plugin', { type: 'string', describe: 'Query to search with', demandOption: true })
        .option('loader', {
          choices: allLoaders,
          describe:
            'Only show plugins that run on this loader, including those built for a loader it is compatible with. Defaults to the loader in plugins.json',
        })
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe:
            'Only show plugins with a version supporting this Minecraft version, e.g. "1.21.1". Defaults to the Minecraft version in plugins.json',
        })
        .option('any-game-version', {
          type: 'boolean',
          conflicts: 'game-version',
          describe:
            'Show plugins whichever Minecraft versions they support, including ones that lag behind plugins.json',
        }),
    (argv) =>
      searchPlugins(defaultPluginsPath, argv.plugin, {
        loader: argv.loader,
        gameVersion: argv.gameVersion,
        anyGameVersion: argv.anyGameVersion,
      }),
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
        .option('loader', {
          choices: allLoaders,
          describe:
            'Resolve against this loader instead of the one in plugins.json, recording it as an override on the plugin',
        })
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: addGameVersionDescription,
        })
        .option('featured', {
          type: 'boolean',
          describe: featuredDescription,
        }),
    (argv) =>
      addPlugins(defaultPluginsPath, argv.plugin, {
        loader: argv.loader,
        gameVersion: argv.gameVersion,
        featured: argv.featured,
      }),
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
    (argv) => viewPlugins(defaultPluginsPath, argv.plugin),
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
    (argv) => showPlugins(defaultPluginsPath, argv.verbose),
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
    (argv) => removePlugins(defaultPluginsPath, argv.plugin),
  )
  .command(
    'substitute <plugin> [substitute]',
    'Use one plugin wherever another is required',
    (yargs) =>
      yargs
        .positional('plugin', {
          type: 'string',
          describe: 'The Modrinth plugin to replace, by slug or id',
          demandOption: true,
        })
        .positional('substitute', {
          type: 'string',
          describe: 'The Modrinth plugin to use in its place, by slug or id',
        })
        .option('remove', {
          type: 'boolean',
          describe: 'Remove the substitution for <plugin> instead',
        }),
    (argv) => substitutePlugins(defaultPluginsPath, argv.plugin, argv.substitute, { remove: argv.remove }),
  )
  .command('install', 'Install plugins', {}, () => installPlugins(defaultPluginsPath))
  .command(
    'update',
    'Update plugins',
    (yargs) =>
      yargs
        .option('game-version', {
          type: 'string',
          alias: 'mc-version',
          describe: updateGameVersionDescription,
        })
        .option('featured', {
          type: 'boolean',
          describe: featuredDescription,
        }),
    (argv) => updatePlugins(defaultPluginsPath, { gameVersion: argv.gameVersion, featured: argv.featured }),
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
