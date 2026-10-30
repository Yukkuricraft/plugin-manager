import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SanityCheckError } from '../../../src/errors.js'
import { type Plugins } from '../../../src/pluginList.js'
import { pinRelease } from '../../../src/sources/ghRelease/pin.js'
import { asset, release } from './fixtures.js'

const { pinUrl } = vi.hoisted(() => ({ pinUrl: vi.fn() }))
vi.mock('../../../src/sources/url/pin.js', () => ({ pinUrl }))

const plugins: Plugins = {
  version: 2,
  config: { loader: 'paper', gameVersion: '1.21.4' },
  added: {},
  all: { modrinth: {}, url: {}, 'gh-release': {} },
}

beforeEach(() => {
  pinUrl.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
})

afterEach(() => vi.useRealTimers())

describe('pinRelease', () => {
  it('combines the download pin with the release details', async () => {
    pinUrl.mockResolvedValue({ filename: 'grief.jar', sha512: 'abc', size: 5 })
    const a = asset('grief.jar', 7)

    const result = await pinRelease(plugins, 'grief', release('grief/3.1.11', '2025-02-01T00:00:00Z', [a]), a)

    expect(pinUrl).toHaveBeenCalledWith(plugins, { source: 'gh-release', id: 'grief' }, a.url)
    expect(result).toEqual({
      source: 'gh-release',
      tag: 'grief/3.1.11',
      version: '3.1.11',
      publishedAt: '2025-02-01T00:00:00Z',
      url: a.url,
      filename: 'grief.jar',
      sha512: 'abc',
      size: 5,
      pinnedAt: '2026-09-19T12:00:00.000Z',
    })
  })

  it('rejects a release without a publish date', async () => {
    const a = asset('grief.jar')
    const undated = { ...release('grief/1', '2025-01-01T00:00:00Z'), published_at: null }
    await expect(pinRelease(plugins, 'grief', undated, a)).rejects.toThrow(SanityCheckError)
  })
})
