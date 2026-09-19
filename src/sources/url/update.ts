import * as prompts from '@inquirer/prompts'

import { type Plugins } from '../../pluginList.js'
import { validateUrl } from '../../utils/files.js'
import type { PluginSource } from '../pluginSource.js'
import { pinUrl } from './pin.js'

type UpdateResult = Awaited<ReturnType<PluginSource['update']>>

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
 * Carries every url entry into `newPlugins`, then asks which ones have a new file, and pins each of those again from
 * a URL and version the user gives. There's nothing to check a URL against for updates, so the rest are kept as they
 * are.
 */
export default async function update(existingPlugins: Plugins, newPlugins: Plugins): Promise<UpdateResult> {
  const result: UpdateResult = { changelog: '', removed: [], added: [], changed: [], overrides: [] }

  // Carried over before anything is pinned, so a new file's name is checked against every other url entry. Modrinth
  // entries are in newPlugins already, since update runs the Modrinth source first
  for (const [id, plugin] of Object.entries(existingPlugins.all.url)) {
    newPlugins.all.url[id] = plugin
    const addedKey = `url:${id}` as const
    if (addedKey in existingPlugins.added) newPlugins.added[addedKey] = existingPlugins.added[addedKey]
  }

  const ids = Object.keys(existingPlugins.all.url).sort()
  if (ids.length === 0) return result

  const ticked = await prompts.checkbox({
    message: 'Which URL plugins have a new artifact?',
    choices: ids.map((id) => {
      const { version, filename } = existingPlugins.all.url[id]
      return { name: `${id} ${version} (${filename})`, value: id }
    }),
  })

  for (const id of ticked) {
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

    const pin = await pinUrl(newPlugins, id, url)
    newPlugins.all.url[id] = { source: 'url', url, version, ...pin }
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
