import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../src/pluginList.js'
import showPlugins from '../../src/commands/showPlugins.js'

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
        substitutes: { we: { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' } },
      },
      added: {},
      all: { modrinth: {}, url: {} },
    }
    loadPlugins.mockResolvedValue(plugins)

    await showPlugins('./plugins.json', false)

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('worldedit → fastasyncworldedit')
  })
})
