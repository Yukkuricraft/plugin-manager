import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../../src/errors.js'
import { type GitHubRelease } from '../../../src/utils/github.js'
import { type Plugins } from '../../../src/pluginList.js'
import update from '../../../src/sources/ghRelease/update.js'
import { ghReleaseEntry } from '../../testFixtures.js'
import { asset, release } from './fixtures.js'

const { listReleases, pickRelease, pickAsset, pinRelease } = vi.hoisted(() => ({
  listReleases: vi.fn(),
  pickRelease: vi.fn(),
  pickAsset: vi.fn(),
  pinRelease: vi.fn(),
}))
vi.mock('../../../src/utils/github.js', () => ({ listReleases }))
vi.mock('../../../src/sources/ghRelease/pick.js', () => ({ pickRelease, pickAsset }))
vi.mock('../../../src/sources/ghRelease/pin.js', () => ({ pinRelease }))

const a1 = release('a/1.0.0', '2025-01-01T00:00:00Z')
const a2 = release('a/2.0.0', '2025-02-01T00:00:00Z')
const b1 = release('b/1.0.0', '2025-01-01T00:00:00Z')

function plugins(): Plugins {
  const all = { a: ghReleaseEntry({ tag: 'a/1.0.0', version: '1.0.0' }), b: ghReleaseEntry({ tag: 'b/1.0.0' }) }
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4', releaseRepo: 'o/r' },
    added: { 'gh-release:a': '1.0.0', 'gh-release:b': '1.0.0' },
    all: { modrinth: {}, url: {}, 'gh-release': all },
  }
}

beforeEach(() => {
  for (const fn of [listReleases, pickRelease, pickAsset, pinRelease]) fn.mockReset()
  listReleases.mockResolvedValue([a1, a2, b1])
  pickRelease.mockImplementation((_id: string, releases: GitHubRelease[]) => Promise.resolve(releases[0]))
  pickAsset.mockResolvedValue(asset('a.jar'))
  pinRelease.mockImplementation((_plugins: Plugins, _id: string, rel: GitHubRelease) =>
    Promise.resolve(ghReleaseEntry({ tag: rel.tag_name, version: rel.tag_name.split('/')[1] })),
  )
})

describe('gh-release update', () => {
  it('without ids, only asks about entries behind their newest release', async () => {
    const next = plugins()
    await update(next, [])

    expect(listReleases).toHaveBeenCalledTimes(1)
    expect(listReleases).toHaveBeenCalledWith('o/r')
    expect(pickRelease).toHaveBeenCalledTimes(1)
    expect(pickRelease).toHaveBeenCalledWith('a', [a2, a1], 'a/1.0.0')
  })

  it('with ids, asks about each even when up to date', async () => {
    const result = await update(plugins(), ['b'])

    expect(pickRelease).toHaveBeenCalledWith('b', [b1], 'b/1.0.0')
    expect(result.changed).toEqual([])
  })

  it('asks once about an id given twice', async () => {
    await update(plugins(), ['a', 'a'])
    expect(pickRelease).toHaveBeenCalledTimes(1)
  })

  it('picking the current release changes nothing', async () => {
    pickRelease.mockResolvedValue(a1)
    const next = plugins()
    const before = structuredClone(next)
    const result = await update(next, ['a'])

    expect(result.changed).toEqual([])
    expect(pinRelease).not.toHaveBeenCalled()
    expect(next).toEqual(before)
  })

  it('reports the version change under gh-release:<id>', async () => {
    const next = plugins()
    const result = await update(next, ['a'])

    expect(pinRelease).toHaveBeenCalledWith(next, 'a', a2, expect.anything())
    expect(result.changed).toEqual([{ identifier: 'gh-release:a', oldVersion: '1.0.0', newVersion: '2.0.0' }])
    expect(next.all['gh-release'].a.tag).toBe('a/2.0.0')
    expect(next.added['gh-release:a']).toBe('2.0.0')
  })

  it('warns instead of asking about an entry with no releases', async () => {
    listReleases.mockResolvedValue([a1, a2])
    const result = await update(plugins(), [])

    expect(pickRelease).toHaveBeenCalledTimes(1)
    expect(result.changed).toHaveLength(1)
  })

  it('lets pickRelease reject an id with no releases', async () => {
    listReleases.mockResolvedValue([a1, a2])
    pickRelease.mockRejectedValue(new UserError('No releases are tagged b/…'))
    await expect(update(plugins(), ['b'])).rejects.toThrow('No releases are tagged')
  })

  it('rejects an unknown id', async () => {
    await expect(update(plugins(), ['zzz'])).rejects.toThrow('No gh-release plugin zzz in plugins.json')
  })
})
