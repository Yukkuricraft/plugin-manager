import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RequestError, UserError } from '../errors.js'

export interface GitHubAsset {
  id: number
  name: string
  /** The API URL of the asset, which serves the file when asked for application/octet-stream */
  url: string
  size: number
}

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  draft: boolean
  published_at: string | null
  html_url: string
  upload_url: string
  assets: GitHubAsset[]
}

const apiBase = 'https://api.github.com'
const pageSize = 100

/** GITHUB_TOKEN, or undefined when it's unset or empty */
export function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || undefined
}

/** Splits `owner/name`. Throws a UserError for anything else */
export function parseRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new UserError(`Invalid GitHub repo "${repo}". Expected owner/name`)
  }
  return { owner: parts[0], name: parts[1] }
}

/**
 * Sends one request to GitHub with the token. Throws a UserError before sending if there's no token, and a
 * RequestError carrying the status and GitHub's message if the answer is neither 2xx nor in `allowStatuses`.
 */
async function request(
  action: string,
  repo: string,
  access: 'read' | 'write',
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {},
  allowStatuses: number[] = [],
): Promise<Response> {
  const token = githubToken()
  if (!token) {
    throw new UserError(`${action} needs GITHUB_TOKEN set to a token with Contents: ${access} on ${repo}`)
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok && !allowStatuses.includes(res.status)) {
    const body = (await res.json().catch(() => undefined)) as { message?: string } | undefined
    throw new RequestError(`${action} failed (${res.status}): ${body?.message ?? res.statusText}`)
  }
  return res
}

function releasesUrl(repo: string): string {
  const { owner, name } = parseRepo(repo)
  return `${apiBase}/repos/${owner}/${name}/releases`
}

/** Every release of `repo`, newest first. Drafts are dropped unless `includeDrafts` */
export async function listReleases(repo: string, opts: { includeDrafts?: boolean } = {}): Promise<GitHubRelease[]> {
  const base = releasesUrl(repo)
  const releases: GitHubRelease[] = []
  for (let page = 1; ; page++) {
    const res = await request(`Listing releases of ${repo}`, repo, 'read', `${base}?per_page=${pageSize}&page=${page}`)
    const batch = (await res.json()) as GitHubRelease[]
    releases.push(...batch)
    if (batch.length < pageSize) break
  }
  return opts.includeDrafts ? releases : releases.filter((release) => !release.draft)
}

/** Whether `repo` has the git tag `tag`, with or without a release */
export async function tagExists(repo: string, tag: string): Promise<boolean> {
  const { owner, name } = parseRepo(repo)
  const tagPath = tag.split('/').map(encodeURIComponent).join('/')
  const res = await request(
    `Looking up tag ${tag} in ${repo}`,
    repo,
    'read',
    `${apiBase}/repos/${owner}/${name}/git/ref/tags/${tagPath}`,
    {},
    [404],
  )
  return res.status !== 404
}

export async function createDraftRelease(repo: string, tag: string, title: string): Promise<GitHubRelease> {
  const res = await request(`Creating a release of ${repo}`, repo, 'write', releasesUrl(repo), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: title, draft: true }),
  })
  return (await res.json()) as GitHubRelease
}

/** Uploads `file` to `release` as an asset named after the file */
export async function uploadReleaseAsset(release: GitHubRelease, file: string): Promise<GitHubAsset> {
  // upload_url is an RFC 6570 template ending in {?name,label}
  const base = release.upload_url.replace(/\{\?[^}]*\}$/, '')
  const repo = new URL(base).pathname.split('/').slice(2, 4).join('/')
  const body = await readFile(file)
  const res = await request(
    `Uploading ${path.basename(file)}`,
    repo,
    'write',
    `${base}?name=${encodeURIComponent(path.basename(file))}`,
    { method: 'POST', headers: { 'Content-Type': 'application/java-archive' }, body },
  )
  return (await res.json()) as GitHubAsset
}

export async function publishRelease(repo: string, releaseId: number): Promise<GitHubRelease> {
  const res = await request(
    `Publishing release ${releaseId} of ${repo}`,
    repo,
    'write',
    `${releasesUrl(repo)}/${releaseId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: false }),
    },
  )
  return (await res.json()) as GitHubRelease
}

export async function deleteRelease(repo: string, releaseId: number): Promise<void> {
  await request(`Deleting release ${releaseId} of ${repo}`, repo, 'write', `${releasesUrl(repo)}/${releaseId}`, {
    method: 'DELETE',
  })
}
