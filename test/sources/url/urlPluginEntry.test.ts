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

const essentials = urlEntry({
  url: 'https://files.example/Essentials.jar',
  version: '2.20.1',
  filename: 'Essentials.jar',
  sha512: 'sha512-essentials',
  size: 24000,
  pinnedAt: '2026-09-19T12:00:00Z',
  overrides: { path: 'PlaceholderAPI/expansions' },
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

  it('shows where an overridden plugin lands in the compact view', () => {
    const entry = new UrlPluginEntry('essentials', essentials)
    entry.printCompact(entry.columnWidths())

    expect(printed()).toContain('PlaceholderAPI/expansions/Essentials.jar')
  })

  it('shows the path on the verbose card of an overridden plugin', () => {
    new UrlPluginEntry('essentials', essentials).printVerbose()

    expect(printed()).toContain('Path')
    expect(printed()).toContain('PlaceholderAPI/expansions')
  })

  it('leaves the path line off the card of a plugin without an override', () => {
    new UrlPluginEntry('vault', vault).printVerbose()

    expect(printed()).not.toContain('Path')
  })
})
