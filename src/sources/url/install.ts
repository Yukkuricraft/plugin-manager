import fs from 'fs/promises'
import path from 'node:path'

import { HashMismatchError, ValidationError } from '../../errors.js'
import { type AllPlugins } from '../../pluginList.js'
import { downloadFile, fileHash } from '../../utils/files.js'
import { output } from '../../utils/output.js'
import { hostHeaders } from './hostHeaders.js'

type PinnedEntry = { url: string; filename: string; sha512: string }

/**
 * Makes `dir` hold exactly the pinned file of every entry. A file already there with an entry's filename and sha512
 * is kept. Everything else is deleted, and whatever is missing is downloaded and checked against its pin.
 * `addAgain` gives the end of the error for a download that no longer matches its pin.
 */
export async function installPinned(
  pinned: Record<string, PinnedEntry>,
  dir: string,
  addAgain: (id: string) => string,
): Promise<void> {
  const entries = Object.entries(pinned)

  const kept = new Set<string>()
  for (const file of await fs.readdir(dir)) {
    const match = entries.find(([, plugin]) => plugin.filename === file)
    if (match && (await fileHash(path.join(dir, file))).sha512 === match[1].sha512) {
      kept.add(match[0])
      output.file(file, 'skipped')
    } else {
      await fs.rm(path.join(dir, file), { force: true })
    }
  }

  await Promise.all(
    entries
      .filter(([id]) => !kept.has(id))
      .map(async ([id, plugin]) => {
        try {
          await downloadFile(plugin.url, dir, {
            id,
            filename: plugin.filename,
            sha512: plugin.sha512,
            hosts: hostHeaders,
          })
        } catch (e) {
          if (e instanceof HashMismatchError) {
            throw new ValidationError(
              `${id}: the file at its URL has changed since it was added. If the new file is intended, ${addAgain(id)}`,
              { cause: e },
            )
          }
          throw e
        }
      }),
  )
}

export default function install(plugins: AllPlugins, dir: string): Promise<void> {
  return installPinned(plugins.url, dir, () => 'run add again')
}
