import { SanityCheckError } from '../../errors.js'
import { type GhReleasePlugin, type Plugins } from '../../pluginList.js'
import { type GitHubAsset, type GitHubRelease } from '../../utils/github.js'
import { pinUrl } from '../url/pin.js'
import { versionFromTag } from './releases.js'

/** Downloads `asset` and returns the lockfile entry pinning it as `release` of plugin `id` */
export async function pinRelease(
  plugins: Plugins,
  id: string,
  release: GitHubRelease,
  asset: GitHubAsset,
): Promise<GhReleasePlugin> {
  if (!release.published_at) throw new SanityCheckError(`Release ${release.tag_name} has no publish date`)
  const pin = await pinUrl(plugins, { source: 'gh-release', id }, asset.url)
  return {
    source: 'gh-release',
    tag: release.tag_name,
    version: versionFromTag(release.tag_name),
    publishedAt: release.published_at,
    url: asset.url,
    ...pin,
    pinnedAt: new Date().toISOString(),
  }
}
