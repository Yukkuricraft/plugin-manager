import fs from 'fs/promises'
import path from 'node:path'
import z from 'zod'

import { UserError } from './errors.js'
import { defaultPluginsPath } from './pluginList.js'

export const defaultEnvironmentsPath = './environments.json'

// environments.json maps a name (e.g. "env1") to the absolute path of the directory that server's plugins.json
// lives in.
const environments = z.record(z.string(), z.string())

export type PluginsPathFlags = { env?: string; pluginsJson?: string }

const exampleFile = `{\n  "env1": "/var/lib/yukkuricraft/env/env1/minecraft/yukkuricraft/plugins"\n}`

// Reads and validates environments.json, throwing a UserError with guidance for anything that's wrong: the file is
// missing, isn't valid JSON, or isn't an object of name -> directory path.
async function readEnvironments(environmentsPath: string): Promise<Record<string, string>> {
  let str: string
  try {
    str = await fs.readFile(environmentsPath, 'utf-8')
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'ENOENT') {
      throw new UserError(
        `--env needs ${environmentsPath}, which doesn't exist. It maps a name to a server's plugins directory:\n${exampleFile}`,
      )
    }
    throw e
  }

  let raw: unknown
  try {
    raw = JSON.parse(str)
  } catch (e) {
    throw new UserError(`${environmentsPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }

  const parsed = environments.safeParse(raw)
  if (!parsed.success) {
    throw new UserError(`${environmentsPath} must be an object mapping a name to a directory:\n${exampleFile}`)
  }
  return parsed.data
}

/**
 * Works out which plugins.json a command should operate on, given its --env and --plugins-json flags:
 *
 * - --plugins-json is used as-is, if given.
 * - --env looks up the named server in environments.json (at environmentsPath, which defaults to
 *   defaultEnvironmentsPath) and returns the plugins.json inside that server's plugins directory.
 * - With neither flag, it falls back to defaultPluginsPath (the plugins.json in the current working directory).
 *
 * Throws UserError for anything a user needs to fix: environments.json missing or malformed, the name not defined
 * in it, or the directory it maps to missing or not actually a directory.
 */
export async function resolvePluginsPath(
  flags: PluginsPathFlags,
  environmentsPath = defaultEnvironmentsPath,
): Promise<string> {
  if (flags.pluginsJson) return flags.pluginsJson
  if (!flags.env) return defaultPluginsPath

  const all = await readEnvironments(environmentsPath)
  const dir = all[flags.env]
  if (dir === undefined) {
    const names = Object.keys(all).sort()
    throw new UserError(
      `${environmentsPath} doesn't define ${flags.env}. It defines ${names.length > 0 ? names.join(', ') : 'nothing'}`,
    )
  }

  // Only the directory is checked here, not whether plugins.json already exists inside it, because that file is
  // what `init` creates. If we required it to already exist, a typo'd directory would be misreported as "run init",
  // and doing so would create a plugins.json in the wrong place. The check below instead catches the likelier
  // mistake of pointing --env's target at the plugins.json file itself rather than its containing directory (which
  // would otherwise silently resolve to <dir>/plugins.json/plugins.json).
  const stat = await fs.stat(dir).catch(() => null)
  if (stat === null) {
    throw new UserError(`${environmentsPath} maps ${flags.env} to ${dir}, which doesn't exist`)
  }
  if (!stat.isDirectory()) {
    throw new UserError(`${environmentsPath} maps ${flags.env} to ${dir}, which isn't a directory`)
  }

  return path.join(dir, 'plugins.json')
}
