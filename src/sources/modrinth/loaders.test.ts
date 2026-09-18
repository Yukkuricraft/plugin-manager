import { describe, expect, it } from 'vitest'

import { loaderCandidates, loaderFallbacks, mostLoaderSpecific } from './loaders.js'

describe('loaderFallbacks', () => {
  it('walks the compatibility chain from most to least specific', () => {
    expect(loaderFallbacks('purpur')).toEqual(['purpur', 'paper', 'spigot', 'bukkit'])
    expect(loaderFallbacks('paper')).toEqual(['paper', 'spigot', 'bukkit'])
  })

  it('treats forks that cannot run the plugins of their parent as roots', () => {
    expect(loaderFallbacks('folia')).toEqual(['folia'])
    expect(loaderFallbacks('velocity')).toEqual(['velocity'])
  })

  it('follows the proxy family separately', () => {
    expect(loaderFallbacks('waterfall')).toEqual(['waterfall', 'bungeecord'])
  })
})

// FastAsyncWorldEdit publishes 2.15.1 as three versions sharing one version number
const fawe = [
  { id: 'Dx0x0kQW', loaders: ['spigot'] },
  { id: 'zAlVhTdU', loaders: ['paper'] },
  { id: 'aHaLro72', loaders: ['paper', 'spigot'] },
]

describe('loaderCandidates', () => {
  it('keeps every version tagged with the loader itself', () => {
    expect(loaderCandidates(fawe, 'paper').map((v) => v.id)).toEqual(['zAlVhTdU', 'aHaLro72'])
  })

  it('falls back up the chain when nothing is tagged for the loader itself', () => {
    const bukkitOnly = [
      { id: 'a', loaders: ['bukkit'] },
      { id: 'b', loaders: ['spigot', 'bukkit'] },
    ]
    expect(loaderCandidates(bukkitOnly, 'paper').map((v) => v.id)).toEqual(['b'])
  })

  it('returns nothing when no version runs on the loader', () => {
    expect(loaderCandidates([{ id: 'a', loaders: ['fabric'] }], 'paper')).toEqual([])
  })
})

describe('mostLoaderSpecific', () => {
  it('prefers the narrowest tag among equivalent versions', () => {
    expect(mostLoaderSpecific(loaderCandidates(fawe, 'paper')).map((v) => v.id)).toEqual(['zAlVhTdU'])
  })

  it('returns nothing for no versions', () => {
    expect(mostLoaderSpecific([])).toEqual([])
  })
})
