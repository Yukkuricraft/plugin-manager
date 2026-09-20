import { describe, expect, it } from 'vitest'

import { type ServerConfig } from '../src/pluginList.js'
import {
  clearGameVersionOverride,
  grantGameVersionOverride,
  overridesFor,
  resolveTarget,
  sameOverrides,
  searchTarget,
} from '../src/resolution.js'

const config: ServerConfig = { loader: 'paper', gameVersion: '1.21.1' }

describe('resolveTarget', () => {
  it('uses the configuration when nothing overrides it', () => {
    expect(resolveTarget(config, undefined, {})).toEqual({ loader: 'paper', gameVersion: '1.21.1', deviations: [] })
  })

  it('prefers a loader flag over the plugin override and the configuration', () => {
    const resolved = resolveTarget(config, { loader: 'spigot' }, { loader: 'bukkit' })
    expect(resolved.loader).toBe('bukkit')
    expect(resolved.deviations).toEqual([{ field: 'loader', configValue: 'paper', usedValue: 'bukkit' }])
  })

  it('keeps a sticky loader override when no flag is given', () => {
    const resolved = resolveTarget(config, { loader: 'spigot' }, {})
    expect(resolved.loader).toBe('spigot')
    expect(resolved.deviations).toEqual([{ field: 'loader', configValue: 'paper', usedValue: 'spigot' }])
  })

  it('does not treat a flag matching the configuration as a deviation', () => {
    expect(resolveTarget(config, undefined, { loader: 'paper', gameVersion: '1.21.1' }).deviations).toEqual([])
  })

  it('prefers a game version flag over the configuration', () => {
    const resolved = resolveTarget(config, undefined, { gameVersion: '1.20.4' })
    expect(resolved.gameVersion).toBe('1.20.4')
    expect(resolved.deviations).toEqual([{ field: 'gameVersion', configValue: '1.21.1', usedValue: '1.20.4' }])
  })

  it('ignores a game version override, which only records that a plugin lags', () => {
    expect(resolveTarget(config, { gameVersion: '1.20.4' }, {})).toEqual({
      loader: 'paper',
      gameVersion: '1.21.1',
      deviations: [],
    })
  })
})

describe('overridesFor', () => {
  it('records nothing for a plugin matching the configuration', () => {
    expect(overridesFor(resolveTarget(config, undefined, {}))).toBeUndefined()
  })

  it('records exactly the deviations', () => {
    expect(overridesFor(resolveTarget(config, undefined, { loader: 'spigot', gameVersion: '1.20.4' }))).toEqual({
      loader: 'spigot',
      gameVersion: '1.20.4',
    })
  })

  it('drops a game version override once the plugin resolves at the configured version', () => {
    expect(overridesFor(resolveTarget(config, { loader: 'spigot', gameVersion: '1.20.4' }, {}))).toEqual({
      loader: 'spigot',
    })
  })
})

describe('grantGameVersionOverride', () => {
  it('adds the game version alongside an existing loader override', () => {
    expect(grantGameVersionOverride({ loader: 'spigot' }, '1.21.1')).toEqual({
      loader: 'spigot',
      gameVersion: '1.21.1',
    })
  })

  it('creates overrides for a plugin that had none', () => {
    expect(grantGameVersionOverride(undefined, '1.21.1')).toEqual({ gameVersion: '1.21.1' })
  })
})

describe('clearGameVersionOverride', () => {
  it('keeps a loader override', () => {
    expect(clearGameVersionOverride({ loader: 'spigot', gameVersion: '1.20.4' })).toEqual({ loader: 'spigot' })
  })

  it('collapses to undefined when nothing is left', () => {
    expect(clearGameVersionOverride({ gameVersion: '1.20.4' })).toBeUndefined()
    expect(clearGameVersionOverride(undefined)).toBeUndefined()
  })
})

describe('sameOverrides', () => {
  it('treats absent and empty as the same', () => {
    expect(sameOverrides(undefined, {})).toBe(true)
  })

  it('compares each field', () => {
    expect(sameOverrides({ loader: 'spigot' }, { loader: 'spigot' })).toBe(true)
    expect(sameOverrides({ loader: 'spigot' }, { loader: 'bukkit' })).toBe(false)
    expect(sameOverrides({ gameVersion: '1.20.4' }, undefined)).toBe(false)
  })
})

describe('searchTarget', () => {
  it('defaults both to the configuration', () => {
    expect(searchTarget(config, {})).toEqual({ loader: 'paper', gameVersion: '1.21.1' })
  })

  it('lets flags override for one run', () => {
    expect(searchTarget(config, { loader: 'velocity', gameVersion: '1.20.4' })).toEqual({
      loader: 'velocity',
      gameVersion: '1.20.4',
    })
  })

  it('drops the game version entirely with anyGameVersion', () => {
    expect(searchTarget(config, { anyGameVersion: true })).toEqual({ loader: 'paper', gameVersion: undefined })
  })
})
