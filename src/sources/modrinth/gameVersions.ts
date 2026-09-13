import * as prompts from '@inquirer/prompts'

import client from './client.js'
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
 * `UserError`; an unrecognised answer at the prompt shows the same message and asks again. Either way, a typo is
 * caught here rather than showing up later as "no versions found" for every plugin.
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
