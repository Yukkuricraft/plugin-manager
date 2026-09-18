import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../errors.js'
import { type Plugins } from '../pluginList.js'
import { modrinthEntry } from '../testFixtures.js'
import installPlugins from './installPlugins.js'

const { loadPlugins, rm, mkdir, cp, sourceInstall } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  cp: vi.fn(),
  sourceInstall: vi.fn(),
}))

// Only loadPlugins is replaced, so the real install-time check runs
vi.mock('../pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
}))
vi.mock('fs/promises', () => ({ default: { rm, mkdir, cp } }))
vi.mock('../sources/pluginSource.js', () => ({ allPluginSources: [{ install: sourceInstall }] }))

function plugins(modrinth: Plugins['all']['modrinth']): Plugins {
  return {
    version: 2,
    config: {
      loader: 'paper',
      gameVersion: '1.21.4',
      substitutes: { we: { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' } },
    },
    added: {},
    all: { modrinth, url: {} },
  }
}

beforeEach(() => {
  for (const fn of [loadPlugins, rm, mkdir, cp, sourceInstall]) fn.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('installPlugins', () => {
  it('refuses before clearing the plugins folder when a replaced project is locked', async () => {
    loadPlugins.mockResolvedValue(plugins({ we: modrinthEntry({ slug: 'worldedit' }) }))

    await expect(installPlugins()).rejects.toThrow(UserError)

    expect(rm).not.toHaveBeenCalled()
    expect(sourceInstall).not.toHaveBeenCalled()
  })

  it('installs when no replaced project is locked', async () => {
    loadPlugins.mockResolvedValue(plugins({ fawe: modrinthEntry({ slug: 'fastasyncworldedit' }) }))

    await installPlugins()

    expect(rm).toHaveBeenCalledWith('./plugins', { recursive: true, force: true })
    expect(sourceInstall).toHaveBeenCalledOnce()
  })
})
