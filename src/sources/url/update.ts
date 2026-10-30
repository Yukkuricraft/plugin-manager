import * as prompts from '@inquirer/prompts'

import { UserError } from '../../errors.js'
import { type Plugins } from '../../pluginList.js'
import { validateUrl } from '../../utils/files.js'
import type { UpdateResult } from '../pluginSource.js'
import { pinUrl } from './pin.js'

/** Formats a version for the changed-plugins summary, adding a hash prefix when two versions would look identical */
function versionLabel(version: string, sha512: string, withHash: boolean) {
  return withHash ? `${version} (${sha512.slice(0, 8)})` : version
}

/** Why `value` can't be the new URL for an entry currently at `currentUrl`, or true if it can */
function checkNewUrl(value: string, currentUrl: string): true | string {
  if (value.trim() === currentUrl) return "That's the current URL"
  try {
    validateUrl(value.trim())
    return true
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * Carries every url entry into `newPlugins`, then pins again each one that has a new file, from a URL and version the
 * user gives. With no `ids` the user ticks which entries those are; otherwise they're `ids`. There's nothing to check
 * a URL against for updates, so the rest are kept as they are.
 */
export default async function update(
  existingPlugins: Plugins,
  newPlugins: Plugins,
  ids: string[],
): Promise<UpdateResult> {
  const result: UpdateResult = { changelog: '', removed: [], added: [], changed: [], overrides: [] }

  const unknown = ids.find((id) => !(id in existingPlugins.all.url))
  if (unknown !== undefined) throw new UserError(`No url plugin ${unknown} in plugins.json`)

  // Carried over before anything is pinned, so a new file's name is checked against every other url entry
  for (const [id, plugin] of Object.entries(existingPlugins.all.url)) {
    newPlugins.all.url[id] = plugin
    const addedKey = `url:${id}` as const
    if (addedKey in existingPlugins.added) newPlugins.added[addedKey] = existingPlugins.added[addedKey]
  }

  const allIds = Object.keys(existingPlugins.all.url).sort()
  if (allIds.length === 0) return result

  const toUpdate =
    ids.length > 0
      ? ids
      : await prompts.checkbox({
          message: 'Which URL plugins have a new artifact?',
          choices: allIds.map((id) => {
            const { version, filename } = existingPlugins.all.url[id]
            return { name: `${id} ${version} (${filename})`, value: id }
          }),
        })

  for (const id of toUpdate) {
    const old = existingPlugins.all.url[id]
    const url = (
      await prompts.input({ message: `New URL for ${id}:`, validate: (value) => checkNewUrl(value, old.url) })
    ).trim()
    const version = (
      await prompts.input({
        message: `Version of ${id} at that URL:`,
        default: old.version,
        validate: (value) => (value.trim() !== '' && !value.includes('@')) || 'Enter a version, without @',
      })
    ).trim()

    const pin = await pinUrl(newPlugins, { source: 'url', id }, url)
    newPlugins.all.url[id] = { source: 'url', url, version, ...pin, pinnedAt: new Date().toISOString() }
    newPlugins.added[`url:${id}`] = version

    const sameVersion = version === old.version
    result.changed.push({
      identifier: `url:${id}`,
      oldVersion: versionLabel(old.version, old.sha512, sameVersion),
      newVersion: versionLabel(version, pin.sha512, sameVersion),
    })
  }

  return result
}
