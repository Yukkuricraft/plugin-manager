import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../src/errors.js'
import { type Plugins } from '../../src/pluginList.js'
import updateModrinth from '../../src/commands/updateModrinth.js'
import { ghReleaseEntry, urlEntry } from '../testFixtures.js'

const { loadPlugins, chooseGameVersion, confirmAndWrite, modrinthUpdate } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  chooseGameVersion: vi.fn(),
  confirmAndWrite: vi.fn(),
  modrinthUpdate: vi.fn(),
}))

vi.mock('../../src/pluginList.js', () => ({ loadPlugins }))
vi.mock('../../src/sources/modrinth/gameVersions.js', () => ({ chooseGameVersion }))
vi.mock('../../src/commands/updateCommon.js', () => ({ confirmAndWrite }))
vi.mock('../../src/sources/modrinth/update.js', () => ({ default: modrinthUpdate }))

const noChanges = { changelog: '', removed: [], added: [], changed: [], overrides: [] }
const url = urlEntry()
const gh = ghReleaseEntry()

function existingPlugins(): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.1' },
    added: { 'modrinth:worldedit': '7.0.0', 'url:vault': '1.0.0', 'gh-release:fawe': '2.0.0' },
    all: { modrinth: {}, url: { vault: url }, 'gh-release': { fawe: gh } },
  }
}

beforeEach(() => {
  loadPlugins.mockReset().mockResolvedValue(existingPlugins())
  chooseGameVersion.mockReset().mockResolvedValue('1.21.4')
  confirmAndWrite.mockReset()
  modrinthUpdate.mockReset().mockResolvedValue(noChanges)
})

describe('updateModrinth', () => {
  it('keeps url and gh-release entries untouched when retargeting', async () => {
    await updateModrinth('./plugins.json', [], {})

    const [path, next, , opts] = confirmAndWrite.mock.calls[0] as [string, Plugins, unknown, unknown]
    expect(path).toBe('./plugins.json')
    expect(next.config.gameVersion).toBe('1.21.4')
    expect(next.all.url).toEqual({ vault: url })
    expect(next.all['gh-release']).toEqual({ fawe: gh })
    expect(next.all.modrinth).toEqual({})
    expect(next.added).toEqual({ 'url:vault': '1.0.0', 'gh-release:fawe': '2.0.0' })
    expect(opts).toEqual({ retargetedFrom: '1.21.1', writeChangelog: true })
  })

  it('rejects --game-version with ids', async () => {
    await expect(updateModrinth('./plugins.json', ['worldedit'], { gameVersion: '1.21.4' })).rejects.toBeInstanceOf(
      UserError,
    )
    expect(confirmAndWrite).not.toHaveBeenCalled()
  })

  it('rejects --featured with ids', async () => {
    await expect(updateModrinth('./plugins.json', ['worldedit'], { featured: true })).rejects.toBeInstanceOf(UserError)
  })
})
