import { beforeEach, describe, expect, it, vi } from 'vitest'

import { urlEntry } from '../../testFixtures.js'
import UrlPluginEntry from '../../../src/sources/url/urlPluginEntry.js'

const vault = urlEntry({
  url: 'https://files.example/Vault.jar',
  version: '1.7.3',
  filename: 'Vault.jar',
  sha512: 'sha512-vault',
  size: 272259,
  pinnedAt: '2026-09-19T12:00:00Z',
})

function printed() {
  return vi.mocked(console.log).mock.calls.flat().join('\n')
}

beforeEach(() => {
  vi.spyOn(console, 'log')
    .mockReset()
    .mockImplementation(() => undefined)
})

describe('UrlPluginEntry', () => {
  it('reports the pinned size', () => {
    expect(new UrlPluginEntry('vault', vault).size).toBe(272259)
  })

  it('shows the version, size and filename in the compact view', () => {
    const entry = new UrlPluginEntry('vault', vault)
    entry.printCompact(entry.columnWidths())

    expect(printed()).toContain('1.7.3')
    expect(printed()).toContain('265.9 KiB')
    expect(printed()).toContain('Vault.jar')
  })

  it('shows the URL and sha512 on the verbose card', () => {
    new UrlPluginEntry('vault', vault).printVerbose()

    expect(printed()).toContain('https://files.example/Vault.jar')
    expect(printed()).toContain('sha512-vault')
  })

  it('shows the pin date in the date column, before the filename', () => {
    const entry = new UrlPluginEntry('vault', vault)
    entry.printCompact(entry.columnWidths())

    expect(printed()).toMatch(/2026-09-19\S*\s+\S*Vault\.jar/)
  })

  it('shows the pin date on the verbose card', () => {
    new UrlPluginEntry('vault', vault).printVerbose()

    expect(printed()).toContain('Pinned')
    expect(printed()).toContain('2026-09-19')
  })

  it('tags a plugin that substitutes for another', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    new UrlPluginEntry('FastAsyncWorldEdit', urlEntry(), 'worldedit').printCompact({
      name: 30,
      version: 8,
      size: 8,
    })

    expect(log.mock.calls[0][0]).toContain('[substitutes worldedit]')
  })
})
