import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../src/errors.js'
import { type Plugins } from '../../src/pluginList.js'
import { modrinthEntry, substituteRule } from '../testFixtures.js'
import removePlugins from '../../src/commands/removePlugins.js'

const { loadPlugins, writePlugins, installPlugins, findPlugin, removePlugin } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  writePlugins: vi.fn(),
  installPlugins: vi.fn(),
  findPlugin: vi.fn(),
  removePlugin: vi.fn(),
}))

vi.mock('../../src/pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
  writePlugins,
}))
vi.mock('../../src/commands/installPlugins.js', () => ({ default: installPlugins }))

const modrinthSource = { prefix: 'modrinth', findPlugin, removePlugin }
vi.mock('../../src/sources/pluginSource.js', () => ({
  getPluginSource: (query: string) => ({ source: modrinthSource, strippedQuery: query }),
}))

/** worldedit is substituted by fastasyncworldedit; fastasyncworldedit is locked as `fawe`, added directly */
function plugins(): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4', substitutes: { we: substituteRule() } },
    added: { 'modrinth:fastasyncworldedit': '1.0.0' },
    all: {
      modrinth: {
        fawe: modrinthEntry({ slug: 'fastasyncworldedit' }),
        other: modrinthEntry({ slug: 'other' }),
      },
      url: {},
    },
  }
}

beforeEach(() => {
  for (const fn of [loadPlugins, writePlugins, installPlugins, findPlugin, removePlugin]) fn.mockReset()
  loadPlugins.mockResolvedValue(plugins())
  writePlugins.mockResolvedValue(undefined)
  installPlugins.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('removePlugins', () => {
  it('refuses to remove a plugin a rule points at, without writing or installing', async () => {
    const p = plugins()
    loadPlugins.mockResolvedValue(p)
    findPlugin.mockResolvedValue({ plugin: p.all.modrinth.fawe, id: 'fawe' })

    await expect(removePlugins('./plugins.json', ['fastasyncworldedit'])).rejects.toThrow(UserError)

    expect(writePlugins).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })

  it('leaves plugins.added untouched on that refusal', async () => {
    const p = plugins()
    loadPlugins.mockResolvedValue(p)
    findPlugin.mockResolvedValue({ plugin: p.all.modrinth.fawe, id: 'fawe' })

    await expect(removePlugins('./plugins.json', ['fastasyncworldedit'])).rejects.toThrow(UserError)

    // Proves the guard ran before the grouping forEach deleted this entry, not just that the call failed somehow
    expect(p.added).toEqual({ 'modrinth:fastasyncworldedit': '1.0.0' })
  })

  it('removes a plugin no rule points at, and writes the result', async () => {
    const p = plugins()
    loadPlugins.mockResolvedValue(p)
    findPlugin.mockResolvedValue({ plugin: p.all.modrinth.other, id: 'other' })

    await removePlugins('./plugins.json', ['other'])

    expect(writePlugins).toHaveBeenCalledWith(p, './plugins.json')
    expect(installPlugins).toHaveBeenCalledWith('./plugins.json')
  })
})
