import { describe, expect, it } from 'vitest'

import { formatOverrides } from '../../src/utils/output.js'

describe('formatOverrides', () => {
  it('describes each override', () => {
    expect(formatOverrides({ loader: 'spigot', gameVersion: '1.20.4' })).toBe('loader spigot, Minecraft 1.20.4')
    expect(formatOverrides({ gameVersion: '1.20.4' })).toBe('Minecraft 1.20.4')
  })

  it('returns undefined for a plugin without overrides', () => {
    expect(formatOverrides(undefined)).toBeUndefined()
    expect(formatOverrides({})).toBeUndefined()
  })
})
