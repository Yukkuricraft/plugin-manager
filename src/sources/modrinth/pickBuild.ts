import { select } from '@inquirer/prompts'

import { RequestError } from '../../errors.js'
import { formatDate } from '../../utils/output.js'
import client from './client.js'
import { type Loader, loaderCandidates, mostLoaderSpecific } from './loaders.js'
import type { components } from './modrinth.js'

type Version = components['schemas']['Version']

/**
 * The listed builds of a project for `gameVersion` that run on `loader`, newest first. Of the builds sharing a version
 * number, such as one jar per platform, only one is kept: the build `currentVersionId` names, else the one tagged
 * with the fewest loaders.
 */
export async function listBuilds(
  projectId: string,
  loader: Loader,
  gameVersion: string,
  currentVersionId?: string,
): Promise<Version[]> {
  const res = await client.GET('/project/{id|slug}/version', {
    params: { path: { 'id|slug': projectId }, query: { game_versions: JSON.stringify([gameVersion]) } },
  })
  if (!res.data) throw new RequestError('Failed to get versions', { cause: res.error })
  const listed = res.data.filter((v) => v.status !== 'unlisted')
  const newestFirst = loaderCandidates(listed, loader).sort((a, b) => b.date_published.localeCompare(a.date_published))
  const byNumber = Map.groupBy(newestFirst, (v) => v.version_number)
  return [...byNumber.values()].map(
    (group) => group.find((v) => v.id === currentVersionId) ?? mostLoaderSpecific(group)[0],
  )
}

/**
 * Asks which of `builds`, sorted newest first, to use. The newest release is preselected, or the newest build when
 * there's no release.
 */
export async function pickBuild(slug: string, builds: Version[], currentVersionId: string): Promise<Version> {
  const choices = builds.map((build) => {
    const current = build.id === currentVersionId ? '  (current)' : ''
    return {
      name: `${build.version_number}  ${build.version_type}  ${formatDate(build.date_published)}${current}`,
      value: build,
    }
  })
  const defaultBuild = builds.find((b) => b.version_type === 'release') ?? builds[0]
  return select({ message: `Which build of ${slug}?`, choices, default: defaultBuild })
}
