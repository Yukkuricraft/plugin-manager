import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError, ValidationError } from '../../../src/errors.js'
import { type Plugins } from '../../../src/pluginList.js'
import { ghReleaseEntry } from '../../testFixtures.js'
import ghReleaseSource from '../../../src/sources/ghRelease/ghReleaseSource.js'
import { release } from './fixtures.js'

const { inspectDownload, listReleases, select } = vi.hoisted(() => ({
  inspectDownload: vi.fn(),
  listReleases: vi.fn(),
  select: vi.fn(),
}))
vi.mock('../../../src/utils/files.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  inspectDownload,
}))
vi.mock('../../../src/utils/github.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listReleases,
}))
vi.mock('@inquirer/prompts', () => ({ select }))

const pin = { filename: 'Vault.jar', sha512: 'sha512-vault', size: 272259 }

function plugins(fields: Partial<Plugins> = {}): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4', releaseRepo: 'o/r' },
    added: {},
    all: { modrinth: {}, url: {}, 'gh-release': {} },
    ...fields,
  }
}

const vault = release('vault/1.7.3', '2026-09-01T00:00:00Z')

beforeEach(() => {
  inspectDownload.mockReset().mockResolvedValue(pin)
  listReleases.mockReset().mockResolvedValue([vault])
  select.mockReset().mockImplementation(({ choices }: { choices: { value: unknown }[] }) => choices[0].value)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ghReleaseSource.addPlugin', () => {
  it('adds the picked release', async () => {
    const locked = plugins()

    await expect(ghReleaseSource.addPlugin(locked, 'vault')).resolves.toBe(true)

    expect(locked.added).toEqual({ 'gh-release:vault': '1.7.3' })
    expect(locked.all['gh-release'].vault).toEqual({
      source: 'gh-release',
      tag: 'vault/1.7.3',
      version: '1.7.3',
      publishedAt: '2026-09-01T00:00:00Z',
      url: vault.assets[0].url,
      ...pin,
      pinnedAt: '2026-09-19T12:00:00.000Z',
    })
    expect(listReleases).toHaveBeenCalledWith('o/r')
  })

  it('returns false when the current release is picked again', async () => {
    const locked = plugins({
      all: { modrinth: {}, url: {}, 'gh-release': { vault: ghReleaseEntry({ tag: 'vault/1.7.3' }) } },
    })

    await expect(ghReleaseSource.addPlugin(locked, 'vault')).resolves.toBe(false)
    expect(inspectDownload).not.toHaveBeenCalled()
  })

  it('rejects an id with a slash', async () => {
    await expect(ghReleaseSource.addPlugin(plugins(), 'a/b')).rejects.toThrow(ValidationError)
  })

  it('rejects an id with an at sign', async () => {
    await expect(ghReleaseSource.addPlugin(plugins(), 'a@b')).rejects.toThrow(ValidationError)
  })
})

describe('ghReleaseSource', () => {
  it('finds a plugin by id', async () => {
    const entry = ghReleaseEntry()
    const all = plugins({ all: { modrinth: {}, url: {}, 'gh-release': { vault: entry } } }).all

    await expect(ghReleaseSource.findPlugin('vault', all)).resolves.toEqual({ plugin: entry, id: 'vault' })
    await expect(ghReleaseSource.findPlugin('nope', all)).resolves.toBeNull()
  })

  it('removes the entry', () => {
    const locked = plugins({ all: { modrinth: {}, url: {}, 'gh-release': { vault: ghReleaseEntry() } } })

    ghReleaseSource.removePlugin(locked, [{ plugin: locked.all['gh-release'].vault, id: 'vault' }])

    expect(locked.all['gh-release']).toEqual({})
  })

  it('does not support search', () => {
    expect(() => ghReleaseSource.search()).toThrow(UserError)
  })

  it('tags the entry a gh-release rule names', () => {
    const p = plugins({
      config: {
        loader: 'paper',
        gameVersion: '1.21.4',
        substitutes: {
          we: { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fawe', substituteSource: 'gh-release' },
        },
      },
      all: { modrinth: {}, url: {}, 'gh-release': { fawe: ghReleaseEntry(), Vault: ghReleaseEntry() } },
    })

    const entries = ghReleaseSource.listEntries(p)

    expect(entries.find((e) => e.name === 'fawe')?.substitutes).toBe('worldedit')
    expect(entries.find((e) => e.name === 'Vault')?.substitutes).toBeUndefined()
  })

  it('update carries gh-release entries over unchanged', async () => {
    const entry = ghReleaseEntry()
    const existing = plugins({
      added: { 'gh-release:vault': '1.0.0' },
      all: { modrinth: {}, url: {}, 'gh-release': { vault: entry } },
    })
    const next = plugins()

    const result = await ghReleaseSource.update(existing, next)

    expect(next.all['gh-release']).toEqual({ vault: entry })
    expect(next.added).toEqual({ 'gh-release:vault': '1.0.0' })
    expect(result).toEqual({ changelog: '', removed: [], added: [], changed: [], overrides: [] })
  })
})
