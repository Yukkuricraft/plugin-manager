import { SanityCheckError, UserError } from '../errors.js'
import { loadPlugins, type Plugins } from '../pluginList.js'
import { chooseGameVersion } from '../sources/modrinth/gameVersions.js'
import update from '../sources/modrinth/update.js'
import { confirmAndWrite } from './updateCommon.js'

export default async function updateModrinth(
  pluginsPath: string,
  ids: string[],
  flags: { gameVersion?: string; featured?: boolean },
): Promise<void> {
  if (ids.length > 0) {
    if (flags.gameVersion !== undefined || flags.featured !== undefined) {
      throw new UserError('--game-version and --featured only apply when no plugins are named')
    }
    throw new SanityCheckError('Updating named Modrinth plugins is not implemented yet')
  }

  const existing = await loadPlugins(pluginsPath)
  const currentGameVersion = existing.config.gameVersion
  const gameVersion = await chooseGameVersion(
    flags.gameVersion,
    'Which Minecraft version should plugins be updated for?',
    currentGameVersion,
  )

  // Modrinth plugins are resolved against the new Minecraft version and written once, after the user confirms. So
  // plugins.json never records the new version while a plugin's build was resolved against another one, unless
  // that plugin carries an override saying so. Url and gh-release entries are pinned files, so they carry over.
  const next: Plugins = {
    version: 2,
    config: { ...existing.config, gameVersion },
    added: Object.fromEntries(Object.entries(existing.added).filter(([key]) => !key.startsWith('modrinth:'))),
    all: { modrinth: {}, url: existing.all.url, 'gh-release': existing.all['gh-release'] },
  }

  const result = await update(existing, next, { gameVersion, featured: flags.featured })
  await confirmAndWrite(pluginsPath, next, result, {
    retargetedFrom: gameVersion !== currentGameVersion ? currentGameVersion : undefined,
    writeChangelog: true,
  })
}
