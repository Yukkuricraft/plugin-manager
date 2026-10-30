import { beforeEach, describe, expect, it, vi } from 'vitest'

import updateGhRelease from '../../src/commands/updateGhRelease.js'
import { type Plugins } from '../../src/pluginList.js'
import { ghReleaseEntry, urlEntry } from '../testFixtures.js'

const { loadPlugins, confirmAndWrite, ghUpdate } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  confirmAndWrite: vi.fn(),
  ghUpdate: vi.fn(),
}))

vi.mock('../../src/pluginList.js', () => ({ loadPlugins }))
vi.mock('../../src/commands/updateCommon.js', () => ({ confirmAndWrite }))
vi.mock('../../src/sources/ghRelease/update.js', () => ({ default: ghUpdate }))

const noChanges = { changelog: '', removed: [], added: [], changed: [], overrides: [] }
const gh = ghReleaseEntry()

let existing: Plugins

beforeEach(() => {
  existing = {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.1' },
    added: { 'url:vault': '1.0.0', 'gh-release:fawe': '2.0.0' },
    all: { modrinth: {}, url: { vault: urlEntry() }, 'gh-release': { fawe: gh } },
  }
  loadPlugins.mockReset().mockResolvedValue(existing)
  confirmAndWrite.mockReset()
  ghUpdate.mockReset().mockResolvedValue(noChanges)
})

describe('updateGhRelease', () => {
  it('updates a copy, so the loaded plugins stay as they were', async () => {
    ghUpdate.mockImplementation((next: Plugins) => {
      next.all['gh-release'].fawe = ghReleaseEntry({ tag: 'fawe/3.0.0' })
      next.added['gh-release:fawe'] = '3.0.0'
      return Promise.resolve(noChanges)
    })
    await updateGhRelease('./plugins.json', ['fawe'])

    const [next, ids] = ghUpdate.mock.calls[0] as [Plugins, string[]]
    expect(ids).toEqual(['fawe'])
    expect(existing.all['gh-release'].fawe).toBe(gh)
    expect(existing.added['gh-release:fawe']).toBe('2.0.0')
    expect(confirmAndWrite).toHaveBeenCalledWith('./plugins.json', next, noChanges, { writeChangelog: false })
  })
})
