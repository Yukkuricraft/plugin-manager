import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError, ValidationError } from '../../errors.js'
import { type Plugins } from '../../pluginList.js'
import { modrinthEntry, urlEntry } from '../../testFixtures.js'
import { hostHeaders } from './hostHeaders.js'
import { parseUrlQuery, pinUrl } from './pin.js'

const { inspectDownload } = vi.hoisted(() => ({ inspectDownload: vi.fn() }))
vi.mock('../../utils/files.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  inspectDownload,
}))

function plugins(all: Partial<Plugins['all']> = {}): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: {},
    all: { modrinth: {}, url: {}, ...all },
  }
}

beforeEach(() => {
  inspectDownload.mockReset()
})

describe('parseUrlQuery', () => {
  it('splits the ID, version and URL', () => {
    expect(parseUrlQuery('vault@1.7.3@https://files.example/Vault.jar')).toEqual({
      id: 'vault',
      version: '1.7.3',
      url: 'https://files.example/Vault.jar',
    })
  })

  it('keeps an @ inside the URL', () => {
    expect(parseUrlQuery('grief@3.1.1@https://files.example/@team/grief.jar').url).toBe(
      'https://files.example/@team/grief.jar',
    )
  })

  it.each([
    ['no version', 'vault@https://files.example/Vault.jar'],
    ['an empty ID', '@1.7.3@https://files.example/Vault.jar'],
    ['an empty version', 'vault@@https://files.example/Vault.jar'],
    ['an empty URL', 'vault@1.7.3@'],
  ])('rejects %s, quoting the syntax', (_, query) => {
    expect(() => parseUrlQuery(query)).toThrow(ValidationError)
    expect(() => parseUrlQuery(query)).toThrow('url:<id>@<version>@<url>')
  })

  it('rejects a URL that is not http or https', () => {
    expect(() => parseUrlQuery('vault@1.7.3@ftp://files.example/Vault.jar')).toThrow(ValidationError)
  })
})

describe('pinUrl', () => {
  const pin = { filename: 'Vault.jar', sha512: 'sha512-vault', size: 10 }

  it('inspects the URL with hostHeaders and the ID as the fallback name', async () => {
    inspectDownload.mockResolvedValue(pin)

    await expect(pinUrl(plugins(), 'vault', 'https://files.example/Vault.jar')).resolves.toEqual(pin)
    expect(inspectDownload).toHaveBeenCalledWith('https://files.example/Vault.jar', hostHeaders, 'vault')
  })

  it('refuses a filename a Modrinth plugin uses', async () => {
    inspectDownload.mockResolvedValue(pin)
    const locked = plugins({ modrinth: { abc: modrinthEntry({ slug: 'vaultunlocked', filename: 'Vault.jar' }) } })

    await expect(pinUrl(locked, 'vault', 'https://files.example/Vault.jar')).rejects.toThrow(UserError)
    await expect(pinUrl(locked, 'vault', 'https://files.example/Vault.jar')).rejects.toThrow('modrinth:vaultunlocked')
  })

  it('refuses a filename another url plugin uses', async () => {
    inspectDownload.mockResolvedValue(pin)
    const locked = plugins({ url: { other: urlEntry({ filename: 'Vault.jar' }) } })

    await expect(pinUrl(locked, 'vault', 'https://files.example/Vault.jar')).rejects.toThrow('url:other')
  })

  it("doesn't count the entry being pinned again as a clash", async () => {
    inspectDownload.mockResolvedValue(pin)
    const locked = plugins({ url: { vault: urlEntry({ filename: 'Vault.jar' }) } })

    await expect(pinUrl(locked, 'vault', 'https://files.example/Vault-new.jar')).resolves.toEqual(pin)
  })
})
