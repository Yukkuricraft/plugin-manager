import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../../src/errors.js'
import { type Plugins, type SubstituteRule } from '../../../src/pluginList.js'
import { modrinthEntry } from '../../testFixtures.js'
import { declareSubstitute, removeSubstitute } from '../../../src/sources/modrinth/substitute.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))

const projects = [
  { id: 'we', slug: 'worldedit' },
  { id: 'fawe', slug: 'fastasyncworldedit' },
  { id: 'other', slug: 'other' },
]

/** Answers project lookups by ID or slug, and 404s for anything else */
function fakeModrinth(path: string, init: { params: { path: Record<string, string> } }) {
  if (path !== '/project/{id|slug}') throw new Error(`Unexpected request to ${path}`)
  const query = init.params.path['id|slug']
  const data = projects.find((p) => p.id === query || p.slug === query)
  return Promise.resolve(data ? { data } : { data: undefined, error: {}, response: { status: 404 } })
}

const weToFawe: SubstituteRule = { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' }

function plugins(fields: Partial<Plugins> = {}): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: {},
    all: { modrinth: {}, url: {} },
    ...fields,
  }
}

function withRules(substitutes: Record<string, SubstituteRule>): Plugins {
  return plugins({ config: { loader: 'paper', gameVersion: '1.21.4', substitutes } })
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(fakeModrinth)
})

describe('declareSubstitute', () => {
  it('records the rule by project ID, with both slugs', async () => {
    const p = plugins()

    expect(await declareSubstitute(p, 'worldedit', 'fastasyncworldedit')).toEqual(weToFawe)
    expect(p.config.substitutes).toEqual({ we: weToFawe })
  })

  it('accepts project IDs', async () => {
    const p = plugins()
    await declareSubstitute(p, 'we', 'fawe')
    expect(p.config.substitutes).toEqual({ we: weToFawe })
  })

  it('keeps existing rules', async () => {
    const p = withRules({ other: { slug: 'other', substitute: 'x', substituteSlug: 'x' } })
    await declareSubstitute(p, 'worldedit', 'fastasyncworldedit')
    expect(Object.keys(p.config.substitutes ?? {}).sort()).toEqual(['other', 'we'])
  })

  it('fails for an unknown project', async () => {
    await expect(declareSubstitute(plugins(), 'nope', 'fawe')).rejects.toThrow('No Modrinth project found for nope')
  })

  it('fails when both name the same project', async () => {
    await expect(declareSubstitute(plugins(), 'worldedit', 'we')).rejects.toThrow("can't substitute for itself")
  })

  it.each<{ when: string; substitutes: Record<string, SubstituteRule> }>([
    {
      when: 'the replaced project is already replaced',
      substitutes: { we: { slug: 'worldedit', substitute: 'other', substituteSlug: 'other' } },
    },
    {
      when: 'the replaced project is already a substitute',
      substitutes: { other: { slug: 'other', substitute: 'we', substituteSlug: 'worldedit' } },
    },
    {
      when: 'the substitute is already replaced',
      substitutes: { fawe: { slug: 'fastasyncworldedit', substitute: 'other', substituteSlug: 'other' } },
    },
    {
      when: 'the substitute is already a substitute',
      substitutes: { other: { slug: 'other', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' } },
    },
  ])('refuses when $when', async ({ substitutes }) => {
    const p = withRules(substitutes)

    const error: unknown = await declareSubstitute(p, 'worldedit', 'fastasyncworldedit').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserError)
    expect((error as Error).message).toContain('is already in the substitution')
    expect((error as Error).message).toContain('`yarn run-cli substitute --remove')
    expect(p.config.substitutes).toEqual(substitutes)
  })

  it('refuses when the replaced project is added', async () => {
    const p = plugins({
      added: { 'modrinth:worldedit': '7.4.5' },
      all: { modrinth: { we: modrinthEntry({ slug: 'worldedit' }) }, url: {} },
    })

    await expect(declareSubstitute(p, 'worldedit', 'fastasyncworldedit')).rejects.toThrow(
      '`yarn run-cli remove worldedit`',
    )
    expect(p.config.substitutes).toBeUndefined()
  })

  it('refuses when the replaced project is a dependency, naming what requires it', async () => {
    const p = plugins({
      all: {
        modrinth: {
          we: modrinthEntry({ slug: 'worldedit', dependedOnBy: new Set(['cb']) }),
          cb: modrinthEntry({ slug: 'craftbook' }),
        },
        url: {},
      },
    })

    await expect(declareSubstitute(p, 'worldedit', 'fastasyncworldedit')).rejects.toThrow(
      'worldedit is locked as a dependency of craftbook',
    )
    expect(p.config.substitutes).toBeUndefined()
  })
})

describe('removeSubstitute', () => {
  it('removes a rule by the replaced project slug, without any request', () => {
    const p = withRules({ we: weToFawe, other: { slug: 'other', substitute: 'x', substituteSlug: 'x' } })

    expect(removeSubstitute(p, 'worldedit')).toEqual(weToFawe)
    expect(Object.keys(p.config.substitutes ?? {})).toEqual(['other'])
    expect(get).not.toHaveBeenCalled()
  })

  it('removes a rule by the replaced project ID, dropping the map once empty', () => {
    const p = withRules({ we: weToFawe })
    removeSubstitute(p, 'we')
    expect(p.config.substitutes).toBeUndefined()
  })

  it('fails when there is no rule for the project', () => {
    expect(() => removeSubstitute(plugins(), 'worldedit')).toThrow('No substitution for worldedit in plugins.json')
  })
})
