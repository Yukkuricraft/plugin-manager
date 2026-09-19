import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../errors.js'
import { type Plugins } from '../pluginList.js'
import { modrinthEntry } from '../testFixtures.js'
import installPlugins from './installPlugins.js'

const { loadPlugins, rm, mkdir, cp, readdir, modrinthInstall, urlInstall } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  cp: vi.fn(),
  readdir: vi.fn(),
  modrinthInstall: vi.fn(),
  urlInstall: vi.fn(),
}))

// Only loadPlugins is replaced, so the real install-time check runs
vi.mock('../pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
}))
vi.mock('fs/promises', () => ({ default: { rm, mkdir, cp, readdir } }))
vi.mock('../sources/pluginSource.js', () => ({
  allPluginSources: [
    { prefix: 'modrinth', install: modrinthInstall },
    { prefix: 'url', install: urlInstall },
  ],
}))

function plugins(modrinth: Plugins['all']['modrinth'] = {}): Plugins {
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

/** What readdir returns for each directory. A directory not listed here is empty */
let listings: Record<string, string[]>

beforeEach(() => {
  for (const fn of [loadPlugins, rm, mkdir, cp, readdir, modrinthInstall, urlInstall]) fn.mockReset()
  listings = {}
  readdir.mockImplementation((dir: string) => Promise.resolve(listings[dir] ?? []))
  loadPlugins.mockResolvedValue(plugins())
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('installPlugins', () => {
  it('refuses before touching any folder when a replaced project is locked', async () => {
    loadPlugins.mockResolvedValue(plugins({ we: modrinthEntry({ slug: 'worldedit' }) }))

    await expect(installPlugins()).rejects.toThrow(UserError)

    expect(rm).not.toHaveBeenCalled()
    expect(modrinthInstall).not.toHaveBeenCalled()
  })

  it('installs when no replaced project is locked', async () => {
    loadPlugins.mockResolvedValue(plugins({ fawe: modrinthEntry({ slug: 'fastasyncworldedit' }) }))

    await installPlugins()

    expect(rm).toHaveBeenCalledWith('./plugins', { recursive: true, force: true })
    expect(modrinthInstall).toHaveBeenCalledOnce()
  })

  it('gives each source its own directory under managedPlugins', async () => {
    await installPlugins()

    expect(mkdir).toHaveBeenCalledWith('./managedPlugins/modrinth', { recursive: true })
    expect(mkdir).toHaveBeenCalledWith('./managedPlugins/url', { recursive: true })
    expect(modrinthInstall).toHaveBeenCalledWith(expect.anything(), './managedPlugins/modrinth')
    expect(urlInstall).toHaveBeenCalledWith(expect.anything(), './managedPlugins/url')
  })

  it('deletes anything in managedPlugins that is not a source directory', async () => {
    listings['./managedPlugins'] = ['modrinth', 'url', 'LuckPerms-Bukkit-5.4.145.jar']

    await installPlugins()

    expect(rm).toHaveBeenCalledWith('./managedPlugins/LuckPerms-Bukkit-5.4.145.jar', { recursive: true, force: true })
    expect(rm).not.toHaveBeenCalledWith('./managedPlugins/modrinth', expect.anything())
    expect(rm).not.toHaveBeenCalledWith('./managedPlugins/url', expect.anything())
  })

  it('refuses a filename two sources both downloaded, before deleting the plugins folder', async () => {
    listings['./managedPlugins/modrinth'] = ['Vault.jar']
    listings['./managedPlugins/url'] = ['Vault.jar']

    await expect(installPlugins()).rejects.toThrow('Vault.jar is downloaded by both modrinth and url')

    expect(rm).not.toHaveBeenCalledWith('./plugins', expect.anything())
    expect(cp).not.toHaveBeenCalled()
  })

  it('leaves the plugins folder alone when a source fails to install', async () => {
    urlInstall.mockRejectedValue(new Error('download failed'))

    await expect(installPlugins()).rejects.toThrow('download failed')

    expect(rm).not.toHaveBeenCalledWith('./plugins', expect.anything())
  })

  it('copies each source directory into the plugins folder, then unmanagedPlugins last', async () => {
    await installPlugins()

    expect(cp.mock.calls.map(([from, to]: string[]) => [from, to])).toEqual([
      ['./managedPlugins/modrinth', './plugins'],
      ['./managedPlugins/url', './plugins'],
      ['./unmanagedPlugins', './plugins'],
    ])
  })
})
