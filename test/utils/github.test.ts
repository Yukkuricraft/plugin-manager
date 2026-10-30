import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RequestError, UserError } from '../../src/errors.js'
import {
  createDraftRelease,
  deleteRelease,
  githubToken,
  listReleases,
  parseRepo,
  publishRelease,
  tagExists,
  uploadReleaseAsset,
  type GitHubRelease,
} from '../../src/utils/github.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const fetchMock = vi.fn<typeof fetch>()

/** The URL and init of the nth request */
function sent(n: number): { url: string; init: RequestInit & { headers: Record<string, string>; body: string } } {
  const [url, init] = fetchMock.mock.calls[n]
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string>; body: string } }
}

function release(id: number, draft = false): GitHubRelease {
  return {
    id,
    tag_name: `v${id}`,
    name: `Release ${id}`,
    draft,
    published_at: draft ? null : '2026-01-01T00:00:00Z',
    html_url: `https://github.com/o/r/releases/tag/v${id}`,
    upload_url: `https://uploads.github.com/repos/o/r/releases/${id}/assets{?name,label}`,
    assets: [],
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GITHUB_TOKEN', 'secret')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('githubToken', () => {
  it('treats an empty GITHUB_TOKEN as unset', () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    expect(githubToken()).toBeUndefined()
  })

  it('returns GITHUB_TOKEN', () => {
    expect(githubToken()).toBe('secret')
  })
})

describe('parseRepo', () => {
  it('splits owner/name', () => {
    expect(parseRepo('o/r')).toEqual({ owner: 'o', name: 'r' })
  })

  it.each(['owner', 'owner/name/extra', '/name', 'owner/'])('rejects %s', (repo) => {
    expect(() => parseRepo(repo)).toThrow(UserError)
  })
})

describe('listReleases', () => {
  it('follows pages until one is short', async () => {
    fetchMock
      .mockResolvedValueOnce(json(Array.from({ length: 100 }, (_, i) => release(i + 1))))
      .mockResolvedValueOnce(json([release(101), release(102), release(103)]))

    const releases = await listReleases('o/r')

    expect(releases).toHaveLength(103)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(0).url).toBe('https://api.github.com/repos/o/r/releases?per_page=100&page=1')
    expect(sent(1).url).toContain('page=2')
  })

  it('drops drafts unless asked for them', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json([release(1), release(2, true)])))

    expect((await listReleases('o/r')).map((r) => r.id)).toEqual([1])
    expect((await listReleases('o/r', { includeDrafts: true })).map((r) => r.id)).toEqual([1, 2])
  })

  it('sends the API headers', async () => {
    fetchMock.mockResolvedValueOnce(json([]))

    await listReleases('o/r')

    expect(sent(0).init.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer secret',
    })
  })

  it('refuses to list without GITHUB_TOKEN and names the variable', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')

    const error = await listReleases('o/r').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserError)
    expect((error as Error).message).toBe(
      'Listing releases of o/r needs GITHUB_TOKEN set to a token with Contents: read on o/r',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('tagExists', () => {
  it('finds a tag, keeping the slashes in its name as path separators', async () => {
    fetchMock.mockResolvedValueOnce(json({ ref: 'refs/tags/fawe/2.0.0' }))

    expect(await tagExists('o/r', 'fawe/2.0.0')).toBe(true)
    expect(sent(0).url).toBe('https://api.github.com/repos/o/r/git/ref/tags/fawe/2.0.0')
  })

  it('encodes each segment of the tag', async () => {
    fetchMock.mockResolvedValueOnce(json({}))

    await tagExists('o/r', 'a b/c#d')

    expect(sent(0).url).toBe('https://api.github.com/repos/o/r/git/ref/tags/a%20b/c%23d')
  })

  it('reports a missing tag', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Not Found' }, 404))

    expect(await tagExists('o/r', 'fawe/2.0.0')).toBe(false)
  })

  it('throws on any other error status', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Server Error' }, 500))

    await expect(tagExists('o/r', 'fawe/2.0.0')).rejects.toThrow(RequestError)
  })
})

describe('writing', () => {
  it('creates a draft release', async () => {
    fetchMock.mockResolvedValueOnce(json(release(9, true), 201))

    await createDraftRelease('o/r', 'v9', 'Grief 3.1.11')

    const { url, init } = sent(0)
    expect(url).toBe('https://api.github.com/repos/o/r/releases')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ tag_name: 'v9', name: 'Grief 3.1.11', draft: true })
  })

  it('publishes a release', async () => {
    fetchMock.mockResolvedValueOnce(json(release(9)))

    await publishRelease('o/r', 9)

    const { url, init } = sent(0)
    expect(url).toBe('https://api.github.com/repos/o/r/releases/9')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ draft: false })
  })

  it('deletes a release', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await deleteRelease('o/r', 9)

    const { url, init } = sent(0)
    expect(url).toBe('https://api.github.com/repos/o/r/releases/9')
    expect(init.method).toBe('DELETE')
  })

  it('asks for write access when the token is unset', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')

    await expect(deleteRelease('o/r', 9)).rejects.toThrow(
      'Deleting release 9 of o/r needs GITHUB_TOKEN set to a token with Contents: write on o/r',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('uploadReleaseAsset', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'github-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("uploads to the release's upload URL without its template", async () => {
    const file = path.join(dir, 'Grief-3.1.11.jar')
    await writeFile(file, 'jar bytes')
    const asset = { id: 5, name: 'Grief-3.1.11.jar', url: 'https://api.github.com/x', size: 9 }
    fetchMock.mockResolvedValueOnce(json(asset, 201))

    const result = await uploadReleaseAsset(release(9, true), file)

    const { url, init } = sent(0)
    expect(url).toBe('https://uploads.github.com/repos/o/r/releases/9/assets?name=Grief-3.1.11.jar')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/java-archive',
      Authorization: 'Bearer secret',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(Buffer.from(init.body as unknown as Uint8Array).toString()).toBe('jar bytes')
    expect(result).toEqual(asset)
  })
})

describe('errors', () => {
  it("reports GitHub's message on an error status", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Validation Failed' }, 422))

    const error = await createDraftRelease('o/r', 'v1', 'x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RequestError)
    expect((error as Error).message).toContain('422')
    expect((error as Error).message).toContain('Validation Failed')
  })
})
