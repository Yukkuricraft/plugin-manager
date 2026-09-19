import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HashMismatchError, RequestError, UserError } from '../errors.js'
import { downloadFile, fetchWithAuth, type HostTable } from './files.js'

const fetchMock = vi.fn<typeof fetch>()

/** A response as fetch would return it for `url`. A Response made in a test has no url, so it's set here */
function respond(url: string, body: BodyInit | null, init: ResponseInit = {}) {
  const res = new Response(body, init)
  Object.defineProperty(res, 'url', { value: url })
  return res
}

function redirect(from: string, to: string) {
  return respond(from, null, { status: 302, headers: { location: to } })
}

/** The headers passed to fetch, one entry per request */
function sentHeaders() {
  return fetchMock.mock.calls.map(([, init]) => init?.headers)
}

const hosts: HostTable = {
  'api.example': { headers: () => ({ Authorization: 'Bearer secret' }), help: 'Set EXAMPLE_TOKEN' },
  'other.example': { headers: () => ({ 'X-Other': 'yes' }) },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithAuth', () => {
  it('sends a host its headers, and a redirect to a host with no entry none at all', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://api.example/asset', 'https://signed.example/file'))
      .mockResolvedValueOnce(respond('https://signed.example/file', 'jar'))

    await fetchWithAuth('https://api.example/asset', hosts)

    expect(sentHeaders()).toEqual([{ Authorization: 'Bearer secret' }, {}])
  })

  it("sends a redirect to another host with an entry that host's headers", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://api.example/asset', 'https://other.example/file'))
      .mockResolvedValueOnce(respond('https://other.example/file', 'jar'))

    await fetchWithAuth('https://api.example/asset', hosts)

    expect(sentHeaders()).toEqual([{ Authorization: 'Bearer secret' }, { 'X-Other': 'yes' }])
  })

  it('resolves a relative redirect against the URL it came from', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://api.example/a/asset', '/b/file'))
      .mockResolvedValueOnce(respond('https://api.example/b/file', 'jar'))

    await fetchWithAuth('https://api.example/a/asset', hosts)

    expect((fetchMock.mock.calls[1][0] as URL).href).toBe('https://api.example/b/file')
  })

  it('follows 5 redirects, and fails on a sixth', async () => {
    for (let i = 0; i < 5; i++) {
      fetchMock.mockResolvedValueOnce(redirect(`https://files.example/${i}`, `https://files.example/${i + 1}`))
    }
    fetchMock.mockResolvedValueOnce(respond('https://files.example/5', 'jar'))
    await expect(fetchWithAuth('https://files.example/0')).resolves.toBeInstanceOf(Response)

    fetchMock.mockReset()
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(redirect(`https://files.example/${i}`, `https://files.example/${i + 1}`))
    }
    await expect(fetchWithAuth('https://files.example/0')).rejects.toThrow(RequestError)
  })

  it('refuses to send a host its headers over http, before making any request', async () => {
    await expect(fetchWithAuth('http://api.example/asset', hosts)).rejects.toThrow(UserError)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("adds the host's help to a 404 from it, without the header values", async () => {
    fetchMock.mockResolvedValueOnce(respond('https://api.example/asset', null, { status: 404 }))

    const error = await fetchWithAuth('https://api.example/asset', hosts).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RequestError)
    expect((error as Error).message).toContain('api.example answered 404')
    expect((error as Error).message).toContain('Set EXAMPLE_TOKEN')
    expect((error as Error).message).not.toContain('secret')
  })

  it('names the host of a 403 when it has no entry', async () => {
    fetchMock.mockResolvedValueOnce(respond('https://plain.example/file', null, { status: 403 }))

    await expect(fetchWithAuth('https://plain.example/file', hosts)).rejects.toThrow('plain.example answered 403')
  })
})

describe('downloadFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'download-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes the file into the given directory', async () => {
    fetchMock.mockResolvedValueOnce(respond('https://files.example/a.jar', 'contents'))

    await downloadFile('https://files.example/a.jar', dir, { id: 'a', filename: 'a.jar' })

    expect(await readdir(dir)).toEqual(['a.jar'])
  })

  it('sends the headers for the host it downloads from', async () => {
    fetchMock.mockResolvedValueOnce(respond('https://api.example/asset', 'contents'))

    await downloadFile('https://api.example/asset', dir, { id: 'a', filename: 'a.jar', hosts })

    expect(sentHeaders()).toEqual([{ Authorization: 'Bearer secret' }])
  })

  it("deletes the file and throws HashMismatchError when it doesn't match its hash", async () => {
    fetchMock.mockResolvedValueOnce(respond('https://files.example/a.jar', 'contents'))

    await expect(
      downloadFile('https://files.example/a.jar', dir, { id: 'a', filename: 'a.jar', sha512: 'not-the-hash' }),
    ).rejects.toThrow(HashMismatchError)
    expect(await readdir(dir)).toEqual([])
  })
})
