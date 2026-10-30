import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../src/pluginList.js'
import updateUrl from '../../src/commands/updateUrl.js'
import { ghReleaseEntry, modrinthEntry, urlEntry } from '../testFixtures.js'

const { loadPlugins, confirmAndWrite, urlUpdate } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  confirmAndWrite: vi.fn(),
  urlUpdate: vi.fn(),
}))

vi.mock('../../src/pluginList.js', () => ({ loadPlugins }))
vi.mock('../../src/commands/updateCommon.js', () => ({ confirmAndWrite }))
vi.mock('../../src/sources/url/update.js', () => ({ default: urlUpdate }))

const noChanges = { changelog: '', removed: [], added: [], changed: [], overrides: [] }
const mod = modrinthEntry()
const gh = ghReleaseEntry()

beforeEach(() => {
  const existing: Plugins = {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.1' },
    added: { 'modrinth:worldedit': '7.0.0', 'url:vault': '1.0.0', 'gh-release:fawe': '2.0.0' },
    all: { modrinth: { we: mod }, url: { vault: urlEntry() }, 'gh-release': { fawe: gh } },
  }
  loadPlugins.mockReset().mockResolvedValue(existing)
  confirmAndWrite.mockReset()
  urlUpdate.mockReset().mockResolvedValue(noChanges)
})

describe('updateUrl', () => {
  it('leaves Modrinth and gh-release entries as they were', async () => {
    await updateUrl('./plugins.json', ['vault'])

    const [existing, next, ids] = urlUpdate.mock.calls[0] as [Plugins, Plugins, string[]]
    expect(ids).toEqual(['vault'])
    expect(existing.all.url).toHaveProperty('vault')
    expect(next.all.url).toEqual({})
    expect(next.added).toEqual({ 'modrinth:worldedit': '7.0.0', 'gh-release:fawe': '2.0.0' })
    expect(next.all.modrinth).toEqual({ we: mod })
    expect(next.all['gh-release']).toEqual({ fawe: gh })
    expect(confirmAndWrite).toHaveBeenCalledWith('./plugins.json', next, noChanges, { writeChangelog: false })
  })
})
