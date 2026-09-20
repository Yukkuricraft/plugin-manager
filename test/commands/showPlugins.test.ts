import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../src/pluginList.js'
import showPlugins from '../../src/commands/showPlugins.js'
import { substituteRule } from '../testFixtures.js'

const { loadPlugins } = vi.hoisted(() => ({ loadPlugins: vi.fn() }))
vi.mock('../../src/pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
}))

beforeEach(() => {
  vi.spyOn(console, 'log')
    .mockReset()
    .mockImplementation(() => undefined)
})

describe('showPlugins', () => {
  it('lists substitutions under the server line', async () => {
    const plugins: Plugins = {
      version: 2,
      config: {
        loader: 'paper',
        gameVersion: '1.21.4',
        substitutes: { we: substituteRule({ substituteSource: 'modrinth' }) },
      },
      added: {},
      all: { modrinth: {}, url: {} },
    }
    loadPlugins.mockResolvedValue(plugins)

    await showPlugins('./plugins.json', false)

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('worldedit → fastasyncworldedit')
    expect(printed).not.toContain('(url)')
  })

  it('marks a substitution by a url plugin', async () => {
    const plugins: Plugins = {
      version: 2,
      config: {
        loader: 'paper',
        gameVersion: '1.21.4',
        substitutes: {
          we: {
            slug: 'worldedit',
            substitute: 'FastAsyncWorldEdit',
            substituteSlug: 'FastAsyncWorldEdit',
            substituteSource: 'url',
          },
        },
      },
      added: {},
      all: { modrinth: {}, url: {} },
    }
    loadPlugins.mockResolvedValue(plugins)

    await showPlugins('./plugins.json', false)

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('worldedit → FastAsyncWorldEdit')
    expect(printed).toContain('(url)')
  })

  it('names the lockfile it read, above the server line', async () => {
    const plugins: Plugins = {
      version: 2,
      config: { loader: 'paper', gameVersion: '1.21.4' },
      added: {},
      all: { modrinth: {}, url: {} },
    }
    loadPlugins.mockResolvedValue(plugins)

    await showPlugins('/var/lib/yukkuricraft/env/env1/minecraft/yukkuricraft/plugins/plugins.json', false)

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('/var/lib/yukkuricraft/env/env1/minecraft/yukkuricraft/plugins/plugins.json')
    expect(printed.indexOf('plugins.json')).toBeLessThan(printed.indexOf('paper 1.21.4'))
  })
})
