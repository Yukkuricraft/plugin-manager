import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../pluginList.js'
import { urlEntry } from '../../testFixtures.js'
import update from './update.js'

const { checkbox, input, pinUrl } = vi.hoisted(() => ({ checkbox: vi.fn(), input: vi.fn(), pinUrl: vi.fn() }))
vi.mock('@inquirer/prompts', () => ({ checkbox, input }))
vi.mock('./pin.js', () => ({ pinUrl }))

const grief = urlEntry({
  url: 'https://files.example/grief-3.1.1.jar',
  version: '3.1.1',
  filename: 'griefdefender-3.1.1.jar',
  sha512: 'aaaaaaaa-old',
})
const vault = urlEntry({ url: 'https://files.example/Vault.jar', version: '1.7.3', filename: 'Vault.jar' })

function plugins(url: Plugins['all']['url'] = {}): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: Object.fromEntries(Object.entries(url).map(([id, entry]) => [`url:${id}`, entry.version])),
    all: { modrinth: {}, url },
  }
}

beforeEach(() => {
  for (const fn of [checkbox, input, pinUrl]) fn.mockReset()
})

describe('url update', () => {
  it('asks nothing when there are no url plugins', async () => {
    const result = await update(plugins(), plugins())

    expect(checkbox).not.toHaveBeenCalled()
    expect(result.changed).toEqual([])
  })

  it('carries unticked plugins over unchanged', async () => {
    checkbox.mockResolvedValue([])
    const next = plugins()

    const result = await update(plugins({ grief, vault }), next)

    expect(next.all.url).toEqual({ grief, vault })
    expect(next.added).toEqual({ 'url:grief': '3.1.1', 'url:vault': '1.7.3' })
    expect(result.changed).toEqual([])
  })

  it('pins a ticked plugin from the new URL and version, and reports the version change', async () => {
    const pin = { filename: 'griefdefender-3.2.0.jar', sha512: 'bbbbbbbb-new', size: 5 }
    checkbox.mockResolvedValue(['grief'])
    input.mockResolvedValueOnce('https://files.example/grief-3.2.0.jar').mockResolvedValueOnce('3.2.0')
    pinUrl.mockResolvedValue(pin)
    const next = plugins()

    const result = await update(plugins({ grief, vault }), next)

    expect(pinUrl).toHaveBeenCalledWith(next, 'grief', 'https://files.example/grief-3.2.0.jar')
    expect(next.all.url.grief).toEqual({
      source: 'url',
      url: 'https://files.example/grief-3.2.0.jar',
      version: '3.2.0',
      ...pin,
    })
    expect(next.added['url:grief']).toBe('3.2.0')
    expect(next.all.url.vault).toEqual(vault)
    expect(result.changed).toEqual([{ identifier: 'url:grief', oldVersion: '3.1.1', newVersion: '3.2.0' }])
  })

  it('shows hash prefixes when the version stays the same', async () => {
    checkbox.mockResolvedValue(['grief'])
    input.mockResolvedValueOnce('https://files.example/grief-rebuilt.jar').mockResolvedValueOnce('3.1.1')
    pinUrl.mockResolvedValue({ filename: 'griefdefender-3.1.1.jar', sha512: 'bbbbbbbb-new', size: 5 })

    const result = await update(plugins({ grief }), plugins())

    expect(result.changed).toEqual([
      { identifier: 'url:grief', oldVersion: '3.1.1 (aaaaaaaa)', newVersion: '3.1.1 (bbbbbbbb)' },
    ])
  })

  it("doesn't accept the current URL, or a URL that isn't http or https", async () => {
    checkbox.mockResolvedValue(['grief'])
    input.mockResolvedValueOnce('https://files.example/grief-3.2.0.jar').mockResolvedValueOnce('3.2.0')
    pinUrl.mockResolvedValue({ filename: 'griefdefender-3.2.0.jar', sha512: 'bbbbbbbb-new', size: 5 })

    await update(plugins({ grief }), plugins())

    const { validate } = input.mock.calls[0][0] as { validate: (value: string) => true | string }
    expect(validate(grief.url)).not.toBe(true)
    expect(validate('ftp://files.example/grief.jar')).not.toBe(true)
    expect(validate('https://files.example/grief-3.2.0.jar')).toBe(true)
  })
})
