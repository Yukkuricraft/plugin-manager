import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../src/pluginList.js'
import { modrinthEntry, substituteRule, urlEntry } from '../testFixtures.js'
import substitutePlugins from '../../src/commands/substitutePlugins.js'

const { loadPlugins, writePlugins, declareSubstitute, removeSubstitute } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  writePlugins: vi.fn(),
  declareSubstitute: vi.fn(),
  removeSubstitute: vi.fn(),
}))

vi.mock('../../src/pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
  writePlugins,
}))
vi.mock('../../src/substitute.js', () => ({ declareSubstitute, removeSubstitute }))

function plugins(fields: Partial<Plugins> = {}): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: {},
    all: { modrinth: {}, url: {} },
    ...fields,
  }
}

beforeEach(() => {
  for (const fn of [loadPlugins, writePlugins, declareSubstitute, removeSubstitute]) fn.mockReset()
  writePlugins.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

function printed() {
  return vi.mocked(console.log).mock.calls.flat().join('\n')
}

describe('substitutePlugins --remove', () => {
  it('prints the note when the url substitute is still present', async () => {
    const rule = substituteRule({
      substitute: 'FastAsyncWorldEdit',
      substituteSlug: 'FastAsyncWorldEdit',
      substituteSource: 'url',
    })
    const p = plugins({ all: { modrinth: {}, url: { FastAsyncWorldEdit: urlEntry() } } })
    loadPlugins.mockResolvedValue(p)
    removeSubstitute.mockReturnValue(rule)

    await substitutePlugins('./plugins.json', 'worldedit', undefined, { remove: true })

    expect(printed()).toContain("keep it until they're next added or updated")
  })

  it('prints the note when the modrinth substitute is still present', async () => {
    const rule = substituteRule({
      substitute: 'fawe',
      substituteSlug: 'fastasyncworldedit',
      substituteSource: 'modrinth',
    })
    const p = plugins({ all: { modrinth: { fawe: modrinthEntry({ slug: 'fastasyncworldedit' }) }, url: {} } })
    loadPlugins.mockResolvedValue(p)
    removeSubstitute.mockReturnValue(rule)

    await substitutePlugins('./plugins.json', 'worldedit', undefined, { remove: true })

    expect(printed()).toContain("keep it until they're next added or updated")
  })

  it('does not print the note when the substitute is absent', async () => {
    const rule = substituteRule({
      substitute: 'fawe',
      substituteSlug: 'fastasyncworldedit',
      substituteSource: 'modrinth',
    })
    const p = plugins()
    loadPlugins.mockResolvedValue(p)
    removeSubstitute.mockReturnValue(rule)

    await substitutePlugins('./plugins.json', 'worldedit', undefined, { remove: true })

    expect(printed()).not.toContain("keep it until they're next added or updated")
  })

  it('does not print the note for a url rule whose substitute id matches an unrelated modrinth entry', async () => {
    const rule = substituteRule({ substitute: 'fawe', substituteSlug: 'fastasyncworldedit', substituteSource: 'url' })
    const p = plugins({ all: { modrinth: { fawe: modrinthEntry({ slug: 'fastasyncworldedit' }) }, url: {} } })
    loadPlugins.mockResolvedValue(p)
    removeSubstitute.mockReturnValue(rule)

    await substitutePlugins('./plugins.json', 'worldedit', undefined, { remove: true })

    expect(printed()).not.toContain("keep it until they're next added or updated")
  })
})
