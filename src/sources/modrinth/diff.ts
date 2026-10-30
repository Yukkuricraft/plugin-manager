import { type AllModrinthPlugins } from '../../pluginList.js'
import { type UpdateResult } from '../pluginSource.js'

/** The Modrinth entries an update removed, added and moved to another version, named by slug, or ID without one */
export function diffModrinth(
  before: AllModrinthPlugins,
  after: AllModrinthPlugins,
): Pick<UpdateResult, 'removed' | 'added' | 'changed'> {
  const removed = Object.entries(before)
    .filter(([id]) => !(id in after))
    .map(([id, p]) => p.slug ?? id)
  const added = Object.entries(after)
    .filter(([id]) => !(id in before))
    .map(([id, p]) => p.slug ?? id)
  const changed = Object.entries(before)
    .filter(([id]) => id in after)
    .map(([id, oldPlugin]) => ({
      identifier: oldPlugin.slug ?? id,
      oldVersion: oldPlugin.version,
      newVersion: after[id].version,
    }))
    .filter((p) => p.oldVersion !== p.newVersion)
  return { removed, added, changed }
}
