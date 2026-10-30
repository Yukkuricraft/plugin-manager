import { type GitHubAsset, type GitHubRelease } from '../../../src/utils/github.js'

export function asset(name: string, id = 1): GitHubAsset {
  return { id, name, url: `https://api.github.com/repos/o/r/releases/assets/${id}`, size: 10 }
}

export function release(tag: string, publishedAt: string, assets: GitHubAsset[] = [asset('a.jar')]): GitHubRelease {
  return {
    id: 1,
    tag_name: tag,
    name: tag,
    draft: false,
    published_at: publishedAt,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    upload_url: 'https://uploads.github.com/x',
    assets,
  }
}
