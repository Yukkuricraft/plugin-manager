import { select } from '@inquirer/prompts'

import { SanityCheckError, UserError } from '../../errors.js'
import { formatDate } from '../../utils/output.js'
import { type GitHubAsset, type GitHubRelease } from '../../utils/github.js'

/** Asks which of `releases`, already filtered to `id` and sorted newest first, to use. The first is preselected. */
export async function pickRelease(id: string, releases: GitHubRelease[], currentTag?: string): Promise<GitHubRelease> {
  if (releases.length === 0) {
    throw new UserError(`No releases are tagged ${id}/…. Run publish on the machine with the JAR.`)
  }
  const choices = releases.map((release) => {
    if (!release.published_at) throw new SanityCheckError(`Release ${release.tag_name} has no publish date`)
    const current = release.tag_name === currentTag ? '  (current)' : ''
    return { name: `${release.tag_name}  ${formatDate(release.published_at)}${current}`, value: release }
  })
  return select({ message: `Which release of ${id}?`, choices, default: releases[0] })
}

/** The release's only asset, or the one the user picks when there are several */
export async function pickAsset(release: GitHubRelease): Promise<GitHubAsset> {
  if (release.assets.length === 0) throw new UserError(`Release ${release.tag_name} has no assets`)
  if (release.assets.length === 1) return release.assets[0]
  return select({
    message: `Which asset of ${release.tag_name}?`,
    choices: release.assets.map((asset) => ({ name: asset.name, value: asset })),
  })
}
