import { UserError } from '../../errors.js'
import { type ServerConfig } from '../../pluginList.js'
import { type GitHubRelease } from '../../utils/github.js'

/** The repo holding release artifacts, e.g. "Yukkuricraft/plugin-artifacts" */
export function requireReleaseRepo(config: ServerConfig): string {
  if (!config.releaseRepo) {
    throw new UserError(
      'Set config.releaseRepo in plugins.json to the GitHub repo holding release artifacts, e.g. "Yukkuricraft/plugin-artifacts"',
    )
  }
  return config.releaseRepo
}

/** Tags are `<id>/<version>`, and the version may itself contain slashes */
export function versionFromTag(tag: string): string {
  return tag.slice(tag.indexOf('/') + 1)
}

/** The releases tagged `<id>/…`, newest first. Releases without a publish date go last. */
export function releasesFor(releases: GitHubRelease[], id: string): GitHubRelease[] {
  const time = (release: GitHubRelease) => (release.published_at ? Date.parse(release.published_at) : -Infinity)
  return releases.filter((release) => release.tag_name.startsWith(`${id}/`)).sort((a, b) => time(b) - time(a))
}
