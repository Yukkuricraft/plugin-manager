import { describe, expect, it } from 'vitest'

import { UserError } from '../../../src/errors.js'
import { requireReleaseRepo, releasesFor, versionFromTag } from '../../../src/sources/ghRelease/releases.js'
import { release } from './fixtures.js'

describe('versionFromTag', () => {
  it('keeps everything after the first slash', () => {
    expect(versionFromTag('dynmap/CE/3.x')).toBe('CE/3.x')
    expect(versionFromTag('grief/3.1.11')).toBe('3.1.11')
  })
})

describe('releasesFor', () => {
  it('keeps only the id and sorts newest first', () => {
    const old = release('vault/1.7.3', '2025-01-01T00:00:00Z')
    const other = release('vault-extra/1.0', '2025-03-01T00:00:00Z')
    const fresh = release('vault/1.7.4', '2025-02-01T00:00:00Z')

    expect(releasesFor([old, other, fresh], 'vault')).toEqual([fresh, old])
  })

  it('sorts releases without a publish date last', () => {
    const undated = { ...release('vault/1.0', '2025-01-01T00:00:00Z'), published_at: null }
    const dated = release('vault/0.9', '2024-01-01T00:00:00Z')

    expect(releasesFor([undated, dated], 'vault')).toEqual([dated, undated])
  })
})

describe('requireReleaseRepo', () => {
  it('returns the configured repo', () => {
    expect(requireReleaseRepo({ loader: 'paper', gameVersion: '1.21.4', releaseRepo: 'a/b' })).toBe('a/b')
  })

  it('throws a UserError naming the setting when unset', () => {
    const call = () => requireReleaseRepo({ loader: 'paper', gameVersion: '1.21.4' })
    expect(call).toThrow(UserError)
    expect(call).toThrow(/releaseRepo/)
  })
})
