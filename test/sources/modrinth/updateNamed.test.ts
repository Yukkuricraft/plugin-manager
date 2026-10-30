import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../../src/errors.js'
import { type ModrinthPlugin, type Plugins } from '../../../src/pluginList.js'
import { exclusiveDependencies, updateNamed } from '../../../src/sources/modrinth/updateNamed.js'
import { modrinthEntry } from '../../testFixtures.js'

const { get, select } = vi.hoisted(() => ({ get: vi.fn(), select: vi.fn() }))
vi.mock('../../../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))
vi.mock('@inquirer/prompts', () => ({ select }))

function modrinthVersion(
  projectId: string,
  versionNumber: string,
  gameVersions: string[],
  publishedAt: string,
  dependsOn: string[] = [],
) {
  return {
    id: `${projectId}-${versionNumber}`,
    project_id: projectId,
    name: `${projectId} ${versionNumber}`,
    version_number: versionNumber,
    version_type: 'release',
    status: 'listed',
    loaders: ['paper'],
    game_versions: gameVersions,
    date_published: publishedAt,
    changelog: `Changes in ${versionNumber}`,
    dependencies: dependsOn.map((id) => ({ project_id: id, version_id: null, dependency_type: 'required' })),
    files: [
      {
        primary: true,
        filename: `${projectId}-${versionNumber}.jar`,
        size: 1,
        url: `https://example.invalid/${projectId}-${versionNumber}.jar`,
        hashes: { sha1: `sha1-${versionNumber}`, sha512: `sha512-${versionNumber}` },
      },
    ],
  }
}

let catalogue: Record<string, ReturnType<typeof modrinthVersion>[]> = {}

/** Serves the project and version-list endpoints from `catalogue`, filtering by game_versions as Modrinth does */
function fakeModrinth(
  path: string,
  init: { params: { path: Record<string, string>; query?: { game_versions?: string } } },
) {
  if (path === '/project/{id|slug}') {
    const id = init.params.path['id|slug']
    return Promise.resolve({ data: { id, slug: id } })
  }
  if (path !== '/project/{id|slug}/version') throw new Error(`Unexpected request to ${path}`)
  const versions = catalogue[init.params.path['id|slug']] ?? []
  const filter = init.params.query?.game_versions
  if (!filter) return Promise.resolve({ data: versions })

  const wanted = JSON.parse(filter) as string[]
  return Promise.resolve({ data: versions.filter((v) => v.game_versions.some((g) => wanted.includes(g))) })
}

/** The version IDs select answers with, when one is offered; otherwise it takes the default */
let picks: string[] = []

/** A lockfile entry for the fake project `id`, at the build modrinthVersion names `${id}-${version}` */
function entry(id: string, version: string, fields: Partial<ModrinthPlugin> = {}): ModrinthPlugin {
  return modrinthEntry({
    slug: id,
    version,
    versionId: `${id}-${version}`,
    publishedAt: '2025-01-01T00:00:00Z',
    ...fields,
  })
}

function plugins(added: string[], modrinth: Record<string, ModrinthPlugin>): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: Object.fromEntries(added.map((id) => [`modrinth:${id}`, modrinth[id].version])),
    all: { modrinth, url: {}, 'gh-release': {} },
  }
}

function printed(): string {
  return vi.mocked(console.log).mock.calls.flat().join('\n')
}

const old = '2025-01-01T00:00:00Z'
const newer = '2026-01-01T00:00:00Z'

beforeEach(() => {
  catalogue = {}
  picks = []
  get.mockReset().mockImplementation(fakeModrinth)
  select
    .mockReset()
    .mockImplementation((args: { choices: { value: { id: string } }[]; default: unknown }) =>
      Promise.resolve(args.choices.find((c) => picks.includes(c.value.id))?.value ?? args.default),
    )
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('exclusiveDependencies', () => {
  it('counts a dependency of only a named plugin', () => {
    const all = { a: entry('a', '1'), x: entry('x', '1', { dependedOnBy: new Set(['a']) }) }

    expect(exclusiveDependencies(all, { 'modrinth:a': '1' }, new Set(['a']))).toEqual(new Set(['x']))
  })

  it('leaves out a dependency another plugin also uses', () => {
    const all = { a: entry('a', '1'), b: entry('b', '1'), x: entry('x', '1', { dependedOnBy: new Set(['a', 'b']) }) }

    expect(exclusiveDependencies(all, { 'modrinth:a': '1', 'modrinth:b': '1' }, new Set(['a']))).toEqual(new Set())
  })

  it('follows a chain of dependencies', () => {
    const all = {
      a: entry('a', '1'),
      x: entry('x', '1', { dependedOnBy: new Set(['a']) }),
      y: entry('y', '1', { dependedOnBy: new Set(['x']) }),
    }

    expect(exclusiveDependencies(all, { 'modrinth:a': '1' }, new Set(['a']))).toEqual(new Set(['x', 'y']))
  })

  it('leaves out an added plugin a named plugin depends on', () => {
    const all = { a: entry('a', '1'), b: entry('b', '1', { dependedOnBy: new Set(['a']) }) }

    expect(exclusiveDependencies(all, { 'modrinth:a': '1', 'modrinth:b': '1' }, new Set(['a']))).toEqual(new Set())
  })
})

describe('updateNamed', () => {
  it('re-resolves a dependency only the named plugin uses', async () => {
    catalogue = {
      a: [
        modrinthVersion('a', '1.0.0', ['1.21.4'], old, ['x']),
        modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['x']),
      ],
      x: [modrinthVersion('x', '1.0.0', ['1.21.4'], old), modrinthVersion('x', '1.1.0', ['1.21.4'], newer)],
    }
    const next = plugins(['a'], { a: entry('a', '1.0.0'), x: entry('x', '1.0.0', { dependedOnBy: new Set(['a']) }) })

    const result = await updateNamed(next, ['a'])

    expect(next.all.modrinth.a).toMatchObject({ version: '2.0.0', versionId: 'a-2.0.0' })
    expect(next.all.modrinth.x).toMatchObject({ version: '1.1.0', dependedOnBy: new Set(['a']) })
    expect(next.added['modrinth:a']).toBe('2.0.0')
    expect(result.changed).toEqual([
      { identifier: 'a', oldVersion: '1.0.0', newVersion: '2.0.0' },
      { identifier: 'x', oldVersion: '1.0.0', newVersion: '1.1.0' },
    ])
    expect(result.changelog).toBe('## a\n### a 2.0.0\nChanges in 2.0.0')
    expect(printed()).toContain('Updating x because only a uses it')
  })

  it("keeps a shared dependency's pin", async () => {
    catalogue = {
      a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['x'])],
      x: [modrinthVersion('x', '1.0.0', ['1.21.4'], old), modrinthVersion('x', '1.1.0', ['1.21.4'], newer)],
    }
    const next = plugins(['a', 'b'], {
      a: entry('a', '1.0.0'),
      b: entry('b', '1.0.0'),
      x: entry('x', '1.0.0', { dependedOnBy: new Set(['a', 'b']) }),
    })

    await updateNamed(next, ['a'])

    expect(next.all.modrinth.x).toMatchObject({ version: '1.0.0', dependedOnBy: new Set(['a', 'b']) })
    expect(printed()).toContain('Not updating x because plugins other than a use it (b)')
  })

  it('drops a dependency the new build no longer needs', async () => {
    catalogue = { a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer)] }
    const next = plugins(['a'], { a: entry('a', '1.0.0'), y: entry('y', '1.0.0', { dependedOnBy: new Set(['a']) }) })

    const result = await updateNamed(next, ['a'])

    expect(Object.keys(next.all.modrinth)).toEqual(['a'])
    expect(result.removed).toEqual(['y'])
    expect(printed()).toContain('Removing y because only a used it')
    expect(printed()).not.toContain('Updating y')
  })

  it('reports a dependency of a re-resolved dependency', async () => {
    catalogue = {
      a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['x'])],
      x: [modrinthVersion('x', '1.1.0', ['1.21.4'], newer, ['y'])],
      y: [modrinthVersion('y', '1.1.0', ['1.21.4'], newer)],
    }
    const next = plugins(['a'], {
      a: entry('a', '1.0.0'),
      x: entry('x', '1.0.0', { dependedOnBy: new Set(['a']) }),
      y: entry('y', '1.0.0', { dependedOnBy: new Set(['x']) }),
    })

    await updateNamed(next, ['a'])

    expect(next.all.modrinth.y.version).toBe('1.1.0')
    expect(printed()).toContain('Updating x because only a uses it')
    expect(printed()).toContain('Updating y because only x uses it')
  })

  it('keeps a dependency a re-resolved dependency shares with another plugin', async () => {
    catalogue = {
      a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['x'])],
      x: [modrinthVersion('x', '1.1.0', ['1.21.4'], newer, ['z'])],
      z: [modrinthVersion('z', '1.1.0', ['1.21.4'], newer)],
    }
    const next = plugins(['a', 'b'], {
      a: entry('a', '1.0.0'),
      b: entry('b', '1.0.0'),
      x: entry('x', '1.0.0', { dependedOnBy: new Set(['a']) }),
      z: entry('z', '1.0.0', { dependedOnBy: new Set(['x', 'b']) }),
    })

    await updateNamed(next, ['a'])

    expect(next.all.modrinth.z).toMatchObject({ version: '1.0.0', dependedOnBy: new Set(['x', 'b']) })
    expect(printed()).toContain('Not updating z because plugins other than x use it (b)')
  })

  it('keeps an added plugin the named plugin depends on', async () => {
    catalogue = { a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['b'])] }
    const next = plugins(['a', 'b'], {
      a: entry('a', '1.0.0'),
      b: entry('b', '1.0.0', { dependedOnBy: new Set(['a']) }),
    })

    await updateNamed(next, ['a'])

    expect(next.all.modrinth.b).toMatchObject({ version: '1.0.0', dependedOnBy: new Set(['a']) })
    expect(printed()).toContain('Not updating b because it was added to plugins.json itself')
  })

  it("falls back to the override's Minecraft version and keeps the override", async () => {
    catalogue = {
      a: [modrinthVersion('a', '1.0.0', ['1.21.1'], old), modrinthVersion('a', '1.1.0', ['1.21.1'], newer)],
    }
    const next = plugins(['a'], { a: entry('a', '1.0.0', { overrides: { gameVersion: '1.21.1' } }) })

    const result = await updateNamed(next, ['a'])

    expect(next.all.modrinth.a).toMatchObject({ version: '1.1.0', overrides: { gameVersion: '1.21.1' } })
    expect(result.overrides).toEqual([])
  })

  it('clears the override when a build for the configured version is picked', async () => {
    catalogue = {
      a: [modrinthVersion('a', '1.0.0', ['1.21.1'], old), modrinthVersion('a', '2.0.0', ['1.21.4'], newer)],
    }
    const next = plugins(['a'], { a: entry('a', '1.0.0', { overrides: { gameVersion: '1.21.1' } }) })

    const result = await updateNamed(next, ['a'])

    expect(next.all.modrinth.a.version).toBe('2.0.0')
    expect(next.all.modrinth.a.overrides).toBeUndefined()
    expect(result.overrides).toEqual([{ identifier: 'a', change: 'cleared', gameVersion: '1.21.1' }])
  })

  it('only clears the override when the current build is picked for the configured version', async () => {
    catalogue = { a: [modrinthVersion('a', '1.0.0', ['1.21.1', '1.21.4'], old)] }
    const next = plugins(['a'], { a: entry('a', '1.0.0', { overrides: { gameVersion: '1.21.1' } }) })

    const result = await updateNamed(next, ['a'])

    expect(next.all.modrinth.a).toMatchObject({ version: '1.0.0', overrides: undefined })
    expect(result.changed).toEqual([])
    expect(result.overrides).toEqual([{ identifier: 'a', change: 'cleared', gameVersion: '1.21.1' }])
  })

  it('keeps the picked build of a named plugin another named plugin depends on', async () => {
    catalogue = {
      a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer, ['c'])],
      c: [
        modrinthVersion('c', '1.0.0', ['1.21.4'], old),
        modrinthVersion('c', '1.5.0', ['1.21.4'], '2025-06-01T00:00:00Z'),
        modrinthVersion('c', '2.0.0', ['1.21.4'], newer),
      ],
    }
    picks = ['c-1.5.0']
    const next = plugins(['a', 'c'], {
      a: entry('a', '1.0.0'),
      c: entry('c', '1.0.0', { dependedOnBy: new Set(['a']) }),
    })

    await updateNamed(next, ['a', 'c'])

    expect(next.all.modrinth.c).toMatchObject({ version: '1.5.0', dependedOnBy: new Set(['a']) })
    expect(next.added['modrinth:c']).toBe('1.5.0')
  })

  it("keeps the other dependants of a named plugin that's also a dependency", async () => {
    catalogue = { c: [modrinthVersion('c', '2.0.0', ['1.21.4'], newer)] }
    const next = plugins(['b', 'c'], {
      b: entry('b', '1.0.0'),
      c: entry('c', '1.0.0', { dependedOnBy: new Set(['b']) }),
    })

    await updateNamed(next, ['c'])

    expect(next.all.modrinth.c).toMatchObject({ version: '2.0.0', dependedOnBy: new Set(['b']) })
    expect(next.all.modrinth.b.version).toBe('1.0.0')
  })

  it('leaves a plugin with no candidate builds unchanged', async () => {
    catalogue = { a: [modrinthVersion('a', '1.0.0', ['1.20.4'], old)] }
    const next = plugins(['a'], { a: entry('a', '1.0.0') })

    const result = await updateNamed(next, ['a'])

    expect(next.all.modrinth.a.version).toBe('1.0.0')
    expect(result).toMatchObject({ removed: [], added: [], changed: [], overrides: [] })
    expect(printed()).toContain('a has no candidate builds for Minecraft 1.21.4')
  })

  it("rejects a plugin that's only a dependency", async () => {
    const next = plugins(['a'], { a: entry('a', '1.0.0'), x: entry('x', '1.0.0', { dependedOnBy: new Set(['a']) }) })

    const error: unknown = await updateNamed(next, ['x']).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserError)
    expect((error as Error).message).toBe('x is only a dependency of a. Update a instead')
  })

  it('rejects an entry nothing depends on that was never added', async () => {
    const next = plugins(['a'], { a: entry('a', '1.0.0'), x: entry('x', '1.0.0') })

    await expect(updateNamed(next, ['x'])).rejects.toThrow(
      "x wasn't added to plugins.json, and no plugin depends on it",
    )
  })

  it('rejects an id plugins.json has no Modrinth plugin for', async () => {
    const next = plugins(['a'], { a: entry('a', '1.0.0') })

    await expect(updateNamed(next, ['nope'])).rejects.toThrow('No Modrinth plugin nope in plugins.json')
  })

  it('handles an id given twice once', async () => {
    catalogue = { a: [modrinthVersion('a', '2.0.0', ['1.21.4'], newer)] }
    const next = plugins(['a'], { a: entry('a', '1.0.0') })

    await updateNamed(next, ['a', 'a'])

    expect(select).toHaveBeenCalledOnce()
  })
})
