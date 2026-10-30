import { UserError } from '../../errors.js'
import { type Plugins } from '../../pluginList.js'
import { listReleases } from '../../utils/github.js'
import { output } from '../../utils/output.js'
import type { UpdateResult } from '../pluginSource.js'
import { pickAsset, pickRelease } from './pick.js'
import { pinRelease } from './pin.js'
import { releasesFor, requireReleaseRepo } from './releases.js'

/**
 * Updates the gh-release entries of `next`, which this mutates. The user picks the release for each id in `ids`, or
 * with none, for each entry that isn't at its newest release.
 */
export default async function update(next: Plugins, ids: string[]): Promise<UpdateResult> {
  const result: UpdateResult = { changelog: '', removed: [], added: [], changed: [], overrides: [] }
  const entries = next.all['gh-release']

  const unknown = ids.find((id) => !(id in entries))
  if (unknown !== undefined) throw new UserError(`No gh-release plugin ${unknown} in plugins.json`)

  const targets = ids.length > 0 ? [...new Set(ids)] : Object.keys(entries).sort()
  if (targets.length === 0) return result

  const releases = await listReleases(requireReleaseRepo(next.config))

  const upToDate: string[] = []
  const noReleases: string[] = []
  for (const id of targets) {
    const old = entries[id]
    const candidates = releasesFor(releases, id)
    if (ids.length === 0) {
      if (candidates.length === 0) {
        noReleases.push(id)
        continue
      }
      if (candidates[0].tag_name === old.tag) {
        upToDate.push(id)
        continue
      }
    }

    const picked = await pickRelease(id, candidates, old.tag)
    if (picked.tag_name === old.tag) continue

    const pinned = await pinRelease(next, id, picked, await pickAsset(picked))
    entries[id] = pinned
    next.added[`gh-release:${id}`] = pinned.version
    result.changed.push({ identifier: `gh-release:${id}`, oldVersion: old.version, newVersion: pinned.version })
  }

  if (upToDate.length > 0) output.info(`Up to date: ${upToDate.join(', ')}`)
  if (noReleases.length > 0) output.warning(`No releases tagged ${noReleases.map((id) => `${id}/`).join(', ')}`)
  return result
}
