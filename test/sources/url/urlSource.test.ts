import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ValidationError } from '../../../src/errors.js'
import { type Plugins } from '../../../src/pluginList.js'
import { urlEntry } from '../../testFixtures.js'
import urlSource from '../../../src/sources/url/urlSource.js'

const { inspectDownload } = vi.hoisted(() => ({ inspectDownload: vi.fn() }))
vi.mock('../../../src/utils/files.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  inspectDownload,
}))

const pin = { filename: 'Vault.jar', sha512: 'sha512-vault', size: 272259 }
const url = 'https://files.example/Vault.jar'

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
  inspectDownload.mockReset().mockResolvedValue(pin)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('urlSource.addPlugin', () => {
  it('pins the file and records the version as the added value', async () => {
    const locked = plugins()

    await expect(urlSource.addPlugin(locked, `vault@1.7.3@${url}`, {})).resolves.toBe(true)

    expect(locked.added).toEqual({ 'url:vault': '1.7.3' })
    expect(locked.all.url.vault).toEqual({
      source: 'url',
      url,
      version: '1.7.3',
      ...pin,
      pinnedAt: '2026-09-19T12:00:00.000Z',
    })
  })

  it('does nothing when the plugin is already added with the same URL and version', async () => {
    const locked = plugins({
      added: { 'url:vault': '1.7.3' },
      all: { modrinth: {}, url: { vault: urlEntry({ url, version: '1.7.3' }) } },
    })

    await expect(urlSource.addPlugin(locked, `vault@1.7.3@${url}`, {})).resolves.toBe(false)
    expect(inspectDownload).not.toHaveBeenCalled()
  })

  it('pins again when the version differs', async () => {
    const locked = plugins({
      added: { 'url:vault': '1.7.2' },
      all: { modrinth: {}, url: { vault: urlEntry({ url, version: '1.7.2' }) } },
    })

    await expect(urlSource.addPlugin(locked, `vault@1.7.3@${url}`, {})).resolves.toBe(true)
    expect(inspectDownload).toHaveBeenCalledOnce()
    expect(locked.added['url:vault']).toBe('1.7.3')
  })

  it('records a path override from the flag', async () => {
    const locked = plugins()

    await expect(
      urlSource.addPlugin(locked, `essentials@1.0.0@${url}`, { path: 'PlaceholderAPI/expansions/' }),
    ).resolves.toBe(true)

    expect(locked.all.url.essentials.overrides).toEqual({ path: 'PlaceholderAPI/expansions' })
  })

  it('passes the path to pinUrl, so the clash check knows where the file lands', async () => {
    const locked = plugins({
      all: { modrinth: {}, url: { other: urlEntry({ filename: 'Vault.jar' }) } },
    })

    await expect(urlSource.addPlugin(locked, `vault@1.7.3@${url}`, { path: 'expansions' })).resolves.toBe(true)
  })

  it('keeps an existing path override when no flag is passed', async () => {
    const locked = plugins({
      added: { 'url:essentials': '1.0.0' },
      all: {
        modrinth: {},
        url: { essentials: urlEntry({ url, version: '1.0.0', overrides: { path: 'PlaceholderAPI/expansions' } }) },
      },
    })

    await expect(urlSource.addPlugin(locked, `essentials@1.1.0@${url}`, {})).resolves.toBe(true)

    expect(locked.all.url.essentials.overrides).toEqual({ path: 'PlaceholderAPI/expansions' })
  })

  it('drops the override when the flag is empty', async () => {
    const locked = plugins({
      added: { 'url:essentials': '1.0.0' },
      all: {
        modrinth: {},
        url: { essentials: urlEntry({ url, version: '1.0.0', overrides: { path: 'PlaceholderAPI/expansions' } }) },
      },
    })

    await expect(urlSource.addPlugin(locked, `essentials@1.0.0@${url}`, { path: '' })).resolves.toBe(true)

    expect(locked.all.url.essentials.overrides).toBeUndefined()
  })

  it('pins again when only the path changed', async () => {
    const locked = plugins({
      added: { 'url:essentials': '1.0.0' },
      all: { modrinth: {}, url: { essentials: urlEntry({ url, version: '1.0.0' }) } },
    })

    await expect(urlSource.addPlugin(locked, `essentials@1.0.0@${url}`, { path: 'expansions' })).resolves.toBe(true)

    expect(inspectDownload).toHaveBeenCalledOnce()
    expect(locked.all.url.essentials.overrides).toEqual({ path: 'expansions' })
  })

  it('does nothing when the URL, version and path all match', async () => {
    const locked = plugins({
      added: { 'url:essentials': '1.0.0' },
      all: {
        modrinth: {},
        url: { essentials: urlEntry({ url, version: '1.0.0', overrides: { path: 'expansions' } }) },
      },
    })

    await expect(urlSource.addPlugin(locked, `essentials@1.0.0@${url}`, { path: 'expansions' })).resolves.toBe(false)
    expect(inspectDownload).not.toHaveBeenCalled()
  })

  it('rejects a path that would escape the plugins folder', async () => {
    await expect(urlSource.addPlugin(plugins(), `essentials@1.0.0@${url}`, { path: '../../etc' })).rejects.toThrow(
      ValidationError,
    )
  })
})
