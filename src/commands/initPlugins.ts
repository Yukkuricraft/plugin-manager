import * as prompts from '@inquirer/prompts'

import { type Plugins, pluginsExist, writePlugins } from '../pluginList.js'
import { chooseGameVersion } from '../sources/modrinth/gameVersions.js'
import { allLoaders, defaultLoader, type Loader } from '../sources/modrinth/loaders.js'
import { UserError } from '../errors.js'
import { output } from '../utils/output.js'

/**
 * Creates plugins.json for a server, asking for whichever of the loader and Minecraft version weren't passed on the
 * command line. Refuses to run if plugins.json already exists, since changing the loader afterwards would invalidate
 * every plugin already resolved against it.
 */
export default async function initPlugins(pluginsPath: string, flags: { loader?: Loader; gameVersion?: string }) {
  if (await pluginsExist(pluginsPath)) {
    throw new UserError(`${pluginsPath} already exists. Delete it first to start over with a different configuration`)
  }

  const loader =
    flags.loader ??
    (await prompts.select({
      message: 'Which loader does the server run?',
      choices: allLoaders.map((l) => ({ name: l, value: l })),
      default: defaultLoader,
    }))
  const gameVersion = await chooseGameVersion(flags.gameVersion, 'Which Minecraft version does the server run?')

  const plugins: Plugins = {
    version: 2,
    config: { loader, gameVersion },
    added: {},
    all: { modrinth: {}, url: {} },
  }
  await writePlugins(plugins, pluginsPath)
  output.success(`Created ${pluginsPath} for ${loader} ${gameVersion}`)
}
