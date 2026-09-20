import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../../src/pluginList.js'
import { modrinthEntry, substituteRule } from '../../testFixtures.js'
import listEntries from '../../../src/sources/modrinth/listEntries.js'

const plugins: Plugins = {
  version: 2,
  config: {
    loader: 'paper',
    gameVersion: '1.21.4',
    substitutes: { we: substituteRule() },
  },
  added: { 'modrinth:fastasyncworldedit': '2.15.4' },
  all: {
    modrinth: {
      fawe: modrinthEntry({ slug: 'fastasyncworldedit', version: '2.15.4' }),
      cb: modrinthEntry({ slug: 'craftbook' }),
    },
    url: {},
  },
}

function printed() {
  return vi.mocked(console.log).mock.calls.flat().join('\n')
}

beforeEach(() => {
  vi.spyOn(console, 'log')
    .mockReset()
    .mockImplementation(() => undefined)
})

describe('listEntries', () => {
  it('marks the entry that substitutes for another project', () => {
    const entries = listEntries(plugins)

    expect(entries.find((e) => e.name === 'fastasyncworldedit')?.substitutes).toBe('worldedit')
    expect(entries.find((e) => e.name === 'craftbook')?.substitutes).toBeUndefined()
  })

  it('notes the substitution in the compact view', () => {
    const fawe = listEntries(plugins).find((e) => e.name === 'fastasyncworldedit')
    fawe?.printCompact({ name: 20, version: 10, size: 10 })

    expect(printed()).toContain('substitutes worldedit')
  })

  it('notes the substitution on the verbose card', () => {
    const fawe = listEntries(plugins).find((e) => e.name === 'fastasyncworldedit')
    fawe?.printVerbose()

    expect(printed()).toContain('Substitutes')
    expect(printed()).toContain('worldedit')
  })
})
