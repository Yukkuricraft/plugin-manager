import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../src/errors.js'
import { type Plugins, type SubstituteRule } from '../src/pluginList.js'
import { modrinthEntry, substituteRule, urlEntry } from './testFixtures.js'
import {
  assertNoSubstitutedPluginsLocked,
  assertNotSubstituting,
  declareSubstitute,
  removeSubstitute,
} from '../src/substitute.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))

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

const weToFawe: SubstituteRule = substituteRule()

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
    const p = withRules({ other: substituteRule({ slug: 'other', substitute: 'x', substituteSlug: 'x' }) })
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
      substitutes: { we: substituteRule({ substitute: 'other', substituteSlug: 'other' }) },
    },
    {
      when: 'the replaced project is already a substitute',
      substitutes: { other: substituteRule({ slug: 'other', substitute: 'we', substituteSlug: 'worldedit' }) },
    },
    {
      when: 'the substitute is already replaced',
      substitutes: {
        fawe: substituteRule({ slug: 'fastasyncworldedit', substitute: 'other', substituteSlug: 'other' }),
      },
    },
    {
      when: 'the substitute is already a substitute',
      substitutes: {
        other: substituteRule({ slug: 'other', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' }),
      },
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

  it('records a url plugin as the substitute', async () => {
    const p = plugins({ all: { modrinth: {}, url: { FastAsyncWorldEdit: urlEntry() } } })

    const rule = await declareSubstitute(p, 'worldedit', 'url:FastAsyncWorldEdit')

    expect(rule).toEqual({
      slug: 'worldedit',
      substitute: 'FastAsyncWorldEdit',
      substituteSlug: 'FastAsyncWorldEdit',
      substituteSource: 'url',
    })
    expect(p.config.substitutes).toEqual({ we: rule })
  })

  it('looks up the replaced project but not the url plugin', async () => {
    const p = plugins({ all: { modrinth: {}, url: { FastAsyncWorldEdit: urlEntry() } } })

    await declareSubstitute(p, 'worldedit', 'url:FastAsyncWorldEdit')

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('refuses a url plugin that is not in plugins.json', async () => {
    const p = plugins()

    await expect(declareSubstitute(p, 'worldedit', 'url:FastAsyncWorldEdit')).rejects.toThrow(UserError)
    await expect(declareSubstitute(p, 'worldedit', 'url:FastAsyncWorldEdit')).rejects.toThrow(
      'yarn run-cli add url:FastAsyncWorldEdit',
    )
    expect(p.config.substitutes).toBeUndefined()
  })

  it('lets one url plugin substitute for several projects', async () => {
    const existing = substituteRule({
      slug: 'other',
      substitute: 'FastAsyncWorldEdit',
      substituteSlug: 'FastAsyncWorldEdit',
      substituteSource: 'url',
    })
    const p = withRules({ other: existing })
    p.all.url = { FastAsyncWorldEdit: urlEntry() }

    const rule = await declareSubstitute(p, 'worldedit', 'url:FastAsyncWorldEdit')

    expect(rule.substituteSource).toBe('url')
    expect(p.config.substitutes).toEqual({ other: existing, we: rule })
  })

  it('lets a url plugin substitute for a project whose id matches a modrinth substitute', async () => {
    const p = withRules({
      other: substituteRule({ slug: 'other', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' }),
    })
    p.all.url = { fawe: urlEntry() }

    const rule = await declareSubstitute(p, 'worldedit', 'url:fawe')

    expect(rule.substituteSource).toBe('url')
  })
})

describe('removeSubstitute', () => {
  it('removes a rule by the replaced project slug, without any request', () => {
    const p = withRules({
      we: weToFawe,
      other: substituteRule({ slug: 'other', substitute: 'x', substituteSlug: 'x' }),
    })

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

describe('assertNoSubstitutedPluginsLocked', () => {
  const worldeditToFawe = { we: substituteRule() }

  function withLocked(modrinth: Plugins['all']['modrinth'], added: Plugins['added'] = {}): Plugins {
    return {
      version: 2,
      config: { loader: 'paper', gameVersion: '1.21.4', substitutes: worldeditToFawe },
      added,
      all: { modrinth, url: {} },
    }
  }

  it('passes when no replaced project is locked', () => {
    const plugins = withLocked({ fawe: modrinthEntry({ slug: 'fastasyncworldedit' }) })
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).not.toThrow()
  })

  it('passes when there are no rules', () => {
    const plugins = withLocked({ we: modrinthEntry({ slug: 'worldedit' }) })
    plugins.config.substitutes = undefined
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).not.toThrow()
  })

  it('tells the user to remove an added replaced project', () => {
    const plugins = withLocked({ we: modrinthEntry({ slug: 'worldedit' }) }, { 'modrinth:worldedit': '1.0.0' })
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow(UserError)
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('`yarn run-cli remove worldedit`')
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('substituted by fastasyncworldedit')
  })

  it('names the plugins that pulled in a replaced dependency', () => {
    const plugins = withLocked({
      we: modrinthEntry({ slug: 'worldedit', dependedOnBy: new Set(['cb']) }),
      cb: modrinthEntry({ slug: 'craftbook' }),
    })
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('dependency of craftbook')
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('`yarn run-cli substitute --remove worldedit`')
  })

  it('catches a chain written into plugins.json by hand', () => {
    // worldedit → fawe → other: a dependency on worldedit resolves to fawe, which a rule replaces
    const plugins = withLocked({ fawe: modrinthEntry({ slug: 'fastasyncworldedit', dependedOnBy: new Set(['cb']) }) })
    plugins.config.substitutes = {
      ...worldeditToFawe,
      fawe: substituteRule({ slug: 'fastasyncworldedit', substitute: 'other', substituteSlug: 'other' }),
    }
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('fastasyncworldedit')
  })

  it('tells the user when a rule points at a url plugin that is missing from plugins.json', () => {
    const plugins = withLocked({})
    plugins.config.substitutes = {
      we: substituteRule({
        substitute: 'FastAsyncWorldEdit',
        substituteSlug: 'FastAsyncWorldEdit',
        substituteSource: 'url',
      }),
    }

    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow(UserError)
    expect(() => assertNoSubstitutedPluginsLocked(plugins)).toThrow('yarn run-cli add url:FastAsyncWorldEdit')
  })

  it('passes when a rule points at a url plugin that is present', () => {
    const plugins = withLocked({})
    plugins.config.substitutes = {
      we: substituteRule({
        substitute: 'FastAsyncWorldEdit',
        substituteSlug: 'FastAsyncWorldEdit',
        substituteSource: 'url',
      }),
    }
    plugins.all.url = { FastAsyncWorldEdit: urlEntry() }

    expect(() => assertNoSubstitutedPluginsLocked(plugins)).not.toThrow()
  })
})

describe('assertNotSubstituting', () => {
  it('refuses to remove a url plugin a rule points at', () => {
    const p = withRules({
      we: substituteRule({
        substitute: 'FastAsyncWorldEdit',
        substituteSlug: 'FastAsyncWorldEdit',
        substituteSource: 'url',
      }),
    })
    const toRemove = [{ plugin: urlEntry(), id: 'FastAsyncWorldEdit' }]

    expect(() => assertNotSubstituting(p, toRemove)).toThrow(UserError)
    expect(() => assertNotSubstituting(p, toRemove)).toThrow('`yarn run-cli substitute --remove worldedit`')
  })

  it('refuses to remove a modrinth plugin a rule points at', () => {
    const p = withRules({ we: substituteRule() })
    const toRemove = [{ plugin: modrinthEntry({ slug: 'fastasyncworldedit' }), id: 'fawe' }]

    expect(() => assertNotSubstituting(p, toRemove)).toThrow('`yarn run-cli substitute --remove worldedit`')
  })

  it('allows removing a plugin no rule points at', () => {
    const p = withRules({ we: substituteRule() })
    const toRemove = [{ plugin: modrinthEntry({ slug: 'other' }), id: 'other' }]

    expect(() => assertNotSubstituting(p, toRemove)).not.toThrow()
  })

  it('does not confuse a url plugin with a modrinth substitute of the same id', () => {
    const p = withRules({ we: substituteRule() })
    const toRemove = [{ plugin: urlEntry(), id: 'fawe' }]

    expect(() => assertNotSubstituting(p, toRemove)).not.toThrow()
  })
})
