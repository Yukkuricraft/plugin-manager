import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ghReleaseEntry } from '../../testFixtures.js'
import GhReleasePluginEntry from '../../../src/sources/ghRelease/ghReleasePluginEntry.js'

const plugin = ghReleaseEntry({ tag: 'vault/1.7.3', version: '1.7.3', filename: 'Vault.jar', size: 272259 })

function printed() {
  return vi.mocked(console.log).mock.calls.flat().join('\n')
}

beforeEach(() => {
  vi.spyOn(console, 'log')
    .mockReset()
    .mockImplementation(() => undefined)
})

describe('GhReleasePluginEntry', () => {
  it('reports the pinned size', () => {
    expect(new GhReleasePluginEntry('vault', plugin).size).toBe(272259)
  })

  it('shows the source, version and filename in the compact view', () => {
    const entry = new GhReleasePluginEntry('vault', plugin)
    entry.printCompact(entry.columnWidths())

    expect(printed()).toContain('(gh-release)')
    expect(printed()).toContain('1.7.3')
    expect(printed()).toContain('Vault.jar')
  })

  it('shows the tag on the verbose card', () => {
    new GhReleasePluginEntry('vault', plugin).printVerbose()

    expect(printed()).toContain('vault/1.7.3')
  })

  it('tags a plugin that substitutes for another', () => {
    new GhReleasePluginEntry('fawe', plugin, 'worldedit').printCompact({ name: 30, version: 8, size: 8 })

    expect(printed()).toContain('[substitutes worldedit]')
  })
})
