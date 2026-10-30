import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import publish from '../../src/commands/publish.js'
import { UserError, ValidationError } from '../../src/errors.js'
import { asset, release } from '../sources/ghRelease/fixtures.js'

const { input, listReleases, createDraftRelease, uploadReleaseAsset, publishRelease, deleteRelease } = vi.hoisted(
  () => ({
    input: vi.fn(),
    listReleases: vi.fn(),
    createDraftRelease: vi.fn(),
    uploadReleaseAsset: vi.fn(),
    publishRelease: vi.fn(),
    deleteRelease: vi.fn(),
  }),
)

vi.mock('@inquirer/prompts', () => ({ input }))
vi.mock('../../src/utils/github.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/github.js')>()),
  listReleases,
  createDraftRelease,
  uploadReleaseAsset,
  publishRelease,
  deleteRelease,
}))

const draft = { ...release('fawe/2.0.0', '2025-01-01T00:00:00Z'), id: 42, draft: true, published_at: null }

let dir: string
let jar: string
let config: string
let logs: string[]

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-'))
  jar = path.join(dir, 'fawe.jar')
  config = path.join(dir, 'publish.json')
  await fs.writeFile(jar, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))
  await fs.writeFile(config, JSON.stringify({ repo: 'o/r' }))

  input.mockReset().mockImplementation(({ default: d }: { default?: string }) => Promise.resolve(d ?? ''))
  listReleases.mockReset().mockResolvedValue([])
  createDraftRelease.mockReset().mockResolvedValue(draft)
  uploadReleaseAsset.mockReset().mockResolvedValue(asset('fawe.jar'))
  publishRelease.mockReset().mockResolvedValue({ ...draft, draft: false, html_url: 'https://github.com/o/r/x' })
  deleteRelease.mockReset().mockResolvedValue(undefined)
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '))
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('publish', () => {
  it('creates, uploads and publishes <id>/<version>', async () => {
    await publish('fawe', '2.0.0', jar, {}, config)

    expect(listReleases).toHaveBeenCalledWith('o/r', { includeDrafts: true })
    expect(createDraftRelease).toHaveBeenCalledWith('o/r', 'fawe/2.0.0', 'fawe v2.0.0')
    expect(uploadReleaseAsset).toHaveBeenCalledWith(draft, jar)
    expect(publishRelease).toHaveBeenCalledWith('o/r', 42)
    const out = logs.join('\n')
    expect(out).toContain('fawe/2.0.0')
    expect(out).toContain('https://github.com/o/r/x')
  })

  it('asks for the repo once and saves it', async () => {
    await fs.rm(config)
    input.mockResolvedValueOnce('o/r')
    await publish('fawe', '2.0.0', jar, {}, config)
    expect(JSON.parse(await fs.readFile(config, 'utf-8'))).toEqual({ repo: 'o/r' })

    input.mockClear()
    await publish('fawe', '2.0.1', jar, {}, config)
    expect(input).toHaveBeenCalledTimes(1) // only the title
    expect(listReleases).toHaveBeenLastCalledWith('o/r', { includeDrafts: true })
  })

  it('prefers --repo over publish.json', async () => {
    await publish('fawe', '2.0.0', jar, { repo: 'a/b' }, config)
    expect(listReleases).toHaveBeenCalledWith('a/b', { includeDrafts: true })
  })

  it('asks for another version when the tag exists', async () => {
    listReleases.mockResolvedValue([draft])
    input.mockResolvedValueOnce('2.0.1')
    await publish('fawe', '2.0.0', jar, {}, config)
    expect(createDraftRelease).toHaveBeenCalledWith('o/r', 'fawe/2.0.1', 'fawe v2.0.1')
  })

  it.each([
    ['GriefDefender v3.1.10', '3.1.11', 'GriefDefender v3.1.11'],
    ['Dynmap CE-3.x-dev-7e0124e0', '3.2.0', 'Dynmap v3.2.0'],
  ])('defaults the title from the previous release (%s)', async (previousTitle, version, expected) => {
    const prefix = previousTitle.split(' ')[0].toLowerCase()
    listReleases.mockResolvedValue([{ ...release(`${prefix}/1`, '2025-01-01T00:00:00Z'), name: previousTitle }])
    await publish(prefix, version, jar, {}, config)
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: expected }))
  })

  it('ignores drafts when defaulting the title', async () => {
    listReleases.mockResolvedValue([{ ...draft, tag_name: 'fawe/1.0.0', name: 'Stray v1' }])
    await publish('fawe', '2.0.0', jar, {}, config)
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ default: 'fawe v2.0.0' }))
  })

  it('deletes the draft when the upload fails', async () => {
    uploadReleaseAsset.mockRejectedValue(new Error('boom'))
    await expect(publish('fawe', '2.0.0', jar, {}, config)).rejects.toThrow('boom')
    expect(deleteRelease).toHaveBeenCalledWith('o/r', 42)
    expect(publishRelease).not.toHaveBeenCalled()
  })

  it('deletes the draft when publishing fails', async () => {
    publishRelease.mockRejectedValue(new Error('nope'))
    await expect(publish('fawe', '2.0.0', jar, {}, config)).rejects.toThrow('nope')
    expect(deleteRelease).toHaveBeenCalledWith('o/r', 42)
  })

  it('refuses a file that is not a JAR', async () => {
    await fs.writeFile(jar, 'hello')
    await expect(publish('fawe', '2.0.0', jar, {}, config)).rejects.toThrow(UserError)
    expect(createDraftRelease).not.toHaveBeenCalled()
  })

  it('refuses a missing file', async () => {
    await expect(publish('fawe', '2.0.0', path.join(dir, 'nope.jar'), {}, config)).rejects.toThrow(UserError)
  })

  it.each([
    ['a/b', '1'],
    ['a@b', '1'],
    ['', '1'],
    ['fawe', ''],
    ['fawe', '1 2'],
  ])('rejects id %j with version %j', async (id, version) => {
    await expect(publish(id, version, jar, {}, config)).rejects.toThrow(ValidationError)
  })

  it('allows slashes in the version', async () => {
    await publish('fawe', 'a/b', jar, {}, config)
    expect(createDraftRelease).toHaveBeenCalledWith('o/r', 'fawe/a/b', 'fawe va/b')
  })

  it('rejects a malformed publish.json', async () => {
    await fs.writeFile(config, '{nope')
    await expect(publish('fawe', '2.0.0', jar, {}, config)).rejects.toThrow(UserError)
  })
})
