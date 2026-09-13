import * as prompts from '@inquirer/prompts'

import client from './client.js'
import { type Loader, loaderCandidates } from './loaders.js'
import { RequestError, UserError } from '../../errors.js'

let knownGameVersions: Promise<Set<string>> | undefined

/** Fetches every Minecraft version Modrinth knows about, caching the request for the rest of the process */
function getKnownGameVersions(): Promise<Set<string>> {
  knownGameVersions ??= client.GET('/tag/game_version').then((res) => {
    if (!res.data) throw new RequestError('Failed to get Minecraft versions', { cause: res.error })
    return new Set(res.data.map((v) => v.version))
  })
  return knownGameVersions
}

function unknownGameVersion(gameVersion: string) {
  return `${gameVersion} is not a Minecraft version Modrinth knows about`
}

/**
 * Resolves the Minecraft version to use. If `given` was passed on the command line it is returned as is; otherwise
 * the user is prompted for one, with `message` as the question and `defaultValue` as the pre-filled answer.
 *
 * Either way the version is checked against Modrinth first. A `given` version Modrinth doesn't recognise throws
 * `UserError`; an unrecognised answer at the prompt shows the same message and asks again. A typo is caught
 * here rather than showing up later as "no versions found" for every plugin.
 */
export async function chooseGameVersion(
  given: string | undefined,
  message: string,
  defaultValue?: string,
): Promise<string> {
  const known = await getKnownGameVersions()
  if (given !== undefined) {
    if (!known.has(given)) throw new UserError(unknownGameVersion(given))
    return given
  }

  return prompts.input({
    message,
    default: defaultValue,
    validate: (value) => known.has(value) || unknownGameVersion(value),
  })
}

/**
 * Returns the last entry of game_versions on the most recently published version of a project for the
 * given loader, i.e. the newest Minecraft version its newest build declares support for. Used when `update`
 * needs to tell the user how far behind a plugin is, so it fetches every version unfiltered rather than
 * reusing the game-version filter that produced no results in the first place. Returns undefined if the
 * project has no version at all for the loader.
 */
export async function newestSupportedGameVersion(projectId: string, loader: Loader): Promise<string | undefined> {
  const res = await client.GET('/project/{id|slug}/version', { params: { path: { 'id|slug': projectId } } })
  if (!res.data) throw new RequestError('Failed to get versions', { cause: res.error })

  const listed = res.data.filter((v) => v.status !== 'unlisted')
  const [newest] = loaderCandidates(listed, loader).sort((a, b) => b.date_published.localeCompare(a.date_published))
  // A version's game_versions array lists Minecraft versions from oldest to newest, so the last entry is the newest one
  return newest?.game_versions?.at(-1)
}
