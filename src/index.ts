import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import addPlugins from './commands/addPlugins.js'
import initPlugins from './commands/initPlugins.js'
import installPlugins from './commands/installPlugins.js'
import publish from './commands/publish.js'
import removePlugins from './commands/removePlugins.js'
import searchPlugins from './commands/searchPlugins.js'
import showPlugins from './commands/showPlugins.js'
import substitutePlugins from './commands/substitutePlugins.js'
import updateGhRelease from './commands/updateGhRelease.js'
import updateModrinth from './commands/updateModrinth.js'
import updateUrl from './commands/updateUrl.js'
import viewPlugins from './commands/viewPlugins.js'
import { resolvePluginsPath } from './environments.js'
import { MissingDataError, RequestError, UserError, ValidationError } from './errors.js'
import { allLoaders } from './sources/modrinth/loaders.js'
import { output } from './utils/output.js'

const pluginSourceDescription =
  'A Modrinth plugin by slug, optionally prefixed with "modrinth:", or "url:<id>" or "gh-release:<id>" for a plugin from those sources.'
const addSourceDescription =
  'A Modrinth slug or id, optionally prefixed with "modrinth:". "gh-release:<id>" lists the releases tagged <id>/… in config.releaseRepo and pins the one you pick.'
const urlSyntaxDescription =
  '"url:<id>@<version>@<url>" pins the file at a URL. The version is a label for the file, such as "1.7.3".'
const addGameVersionDescription =
  'Resolve against this Minecraft version, e.g. "1.20.4", instead of the one in plugins.json, recording it as an override on the plugin. Applies to dependencies too.'
const updateGameVersionDescription =
  'The Minecraft version to update every Modrinth plugin for, e.g. "1.21.4". Asked for if not given, defaulting to the one in plugins.json, which is then updated to match. Only without plugin names.'
const featuredDescription =
  'Only consider plugin versions the author has marked as featured on Modrinth. Does not apply to dependencies, and is not remembered between runs.'
const updateFeaturedDescription = `${featuredDescription} Only without plugin names.`
const versionSyntaxDescription =
  'To pin a Modrinth plugin to a specific version, use "<plugin>@<version>". The version must exactly match the Modrinth version number. If omitted, the latest matching version is resolved.'
const envDescription =
  'The server to work on, by a name in environments.json, which maps names to server plugins directories. Its plugins.json is used.'
const pluginsJsonDescription =
  'The plugins.json to work on. Defaults to ./plugins.json. Use --env instead to name a server set up in environments.json.'

await yargs()
  .scriptName('plugins')
  .usage('$0 <cmd> [args]')
  .option('env', {
    type: 'string',
    describe: envDescription,
  })
  .option('plugins-json', {
    type: 'string',
    describe: pluginsJsonDescription,
  })
  .conflicts('env', 'plugins-json')
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
    async (argv) => initPlugins(await resolvePluginsPath(argv), { loader: argv.loader, gameVersion: argv.gameVersion }),
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
    async (argv) =>
      searchPlugins(await resolvePluginsPath(argv), argv.plugin, {
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
          describe: `Plugin to add. ${addSourceDescription} ${urlSyntaxDescription} ${versionSyntaxDescription}`,
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
    async (argv) =>
      addPlugins(await resolvePluginsPath(argv), argv.plugin, {
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
    async (argv) => viewPlugins(await resolvePluginsPath(argv), argv.plugin),
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
    async (argv) => showPlugins(await resolvePluginsPath(argv), argv.verbose),
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
    async (argv) => removePlugins(await resolvePluginsPath(argv), argv.plugin),
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
          describe:
            'The plugin to use in its place: a Modrinth slug or id, or url: or gh-release: and the id of an added plugin of that source',
        })
        .option('remove', {
          type: 'boolean',
          describe: 'Remove the substitution for <plugin> instead',
        }),
    async (argv) =>
      substitutePlugins(await resolvePluginsPath(argv), argv.plugin, argv.substitute, { remove: argv.remove }),
  )
  .command(
    'install',
    'Install plugins',
    (yargs) => yargs,
    async (argv) => installPlugins(await resolvePluginsPath(argv)),
  )
  .command(
    'update',
    'Update the plugins of one source',
    (yargs) =>
      yargs
        .command(
          'modrinth [plugin..]',
          'Update named Modrinth plugins, or all of them for a Minecraft version',
          (yargs) =>
            yargs
              .positional('plugin', {
                type: 'string',
                describe:
                  'Added Modrinth plugins to update, each to a build you pick for the Minecraft version in plugins.json. Dependencies only they use move to their newest build. Without any, every added Modrinth plugin moves to its newest build for --game-version',
                array: true,
              })
              .option('game-version', {
                type: 'string',
                alias: 'mc-version',
                describe: updateGameVersionDescription,
              })
              .option('featured', {
                type: 'boolean',
                describe: updateFeaturedDescription,
              }),
          async (argv) =>
            updateModrinth(await resolvePluginsPath(argv), argv.plugin ?? [], {
              gameVersion: argv.gameVersion,
              featured: argv.featured,
            }),
        )
        .command(
          'url [plugin..]',
          'Update URL plugins to a new file',
          (yargs) =>
            yargs.positional('plugin', {
              type: 'string',
              describe: 'URL plugins to give a new URL and version. Asked for if none are given',
              array: true,
            }),
          async (argv) => updateUrl(await resolvePluginsPath(argv), argv.plugin ?? []),
        )
        .command(
          'gh-release [plugin..]',
          'Update gh-release plugins to a release from the release repo',
          (yargs) =>
            yargs.positional('plugin', {
              type: 'string',
              describe:
                'gh-release plugins to pick a release for. Without any, each plugin behind its newest release is asked about',
              array: true,
            }),
          async (argv) => updateGhRelease(await resolvePluginsPath(argv), argv.plugin ?? []),
        )
        .demandCommand(1, 'Specify which source to update'),
    () => undefined,
  )
  .command(
    'publish <id> <version> <jar>',
    'Release a JAR into the gh-release repo as the tag <id>/<version>',
    (yargs) =>
      yargs
        // publish runs where the JAR is, with no plugins.json
        .hide('env')
        .hide('plugins-json')
        .positional('id', { type: 'string', describe: 'The plugin id, the tag prefix', demandOption: true })
        .positional('version', { type: 'string', describe: 'The version label, e.g. "3.1.11"', demandOption: true })
        .positional('jar', { type: 'string', describe: 'Path to the JAR to upload', demandOption: true })
        .option('repo', {
          type: 'string',
          describe:
            'The GitHub repo to release into, as owner/name. Defaults to the repo saved in ./publish.json, which is asked for and saved if missing',
        }),
    async (argv) => publish(argv.id, argv.version, argv.jar, { repo: argv.repo }),
  )
  .completion()
  .help()
  .recommendCommands()
  // yargs' --version would fill argv.version, which publish's <version> positional needs
  .version(false)
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
