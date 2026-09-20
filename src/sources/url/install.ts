import fs from 'fs/promises'
import path from 'node:path'

import { HashMismatchError, UserError, ValidationError } from '../../errors.js'
import { type AllPlugins } from '../../pluginList.js'
import { downloadFile, fileHash, listFiles, pruneEmptyDirs } from '../../utils/files.js'
import { output } from '../../utils/output.js'
import { hostHeaders } from './hostHeaders.js'
import { installedPath } from './pin.js'

/**
 * Makes `dir` hold exactly the pinned file of every url entry, each under the directory its path override names. A
 * file already there at an entry's path with its sha512 is kept. Everything else is deleted, and whatever is missing
 * is downloaded and checked against its pin.
 */
export default async function install(plugins: AllPlugins, dir: string): Promise<void> {
  const entries = Object.entries(plugins.url)

  // The downloads below run in Promise.all, so two entries landing on one path would overwrite each other. add
  // refuses that pairing, so hitting it here means plugins.json was edited by hand
  const owners = new Map<string, string>()
  for (const [id, plugin] of entries) {
    const target = installedPath(plugin.filename, plugin.overrides?.path)
    const other = owners.get(target)
    if (other) throw new UserError(`Refusing to install: ${other} and ${id} are both installed to ${target}`)
    owners.set(target, id)
  }

  const kept = new Set<string>()
  for (const file of await listFiles(dir)) {
    const match = entries.find(([, plugin]) => installedPath(plugin.filename, plugin.overrides?.path) === file)
    if (match && (await fileHash(path.join(dir, file))).sha512 === match[1].sha512) {
      kept.add(match[0])
      output.file(file, 'skipped')
    } else {
      await fs.rm(path.join(dir, file), { force: true })
    }
  }
  // So a dropped override doesn't leave an empty directory for the plugins folder to be rebuilt with
  await pruneEmptyDirs(dir)

  await Promise.all(
    entries
      .filter(([id]) => !kept.has(id))
      .map(async ([id, plugin]) => {
        const into = path.join(dir, plugin.overrides?.path ?? '')
        await fs.mkdir(into, { recursive: true })
        try {
          await downloadFile(plugin.url, into, {
            id,
            filename: plugin.filename,
            sha512: plugin.sha512,
            hosts: hostHeaders,
          })
        } catch (e) {
          if (e instanceof HashMismatchError) {
            throw new ValidationError(
              `${id}: the file at its URL has changed since it was added. If the new file is intended, run add again`,
              { cause: e },
            )
          }
          throw e
        }
      }),
  )
}
