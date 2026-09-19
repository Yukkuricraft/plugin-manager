import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../../src/errors.js'
import { type Plugins } from '../../../src/pluginList.js'
import { modrinthEntry } from '../../testFixtures.js'
import addPlugin from '../../../src/sources/modrinth/addPlugin.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))
vi.mock('@inquirer/prompts', () => ({
  select: () => {
    throw new Error('Unexpected prompt')
  },
}))

function version(projectId: string, versionNumber: string, dependencies: object[] = []) {
  return {
    id: `${projectId}-${versionNumber}`,
    project_id: projectId,
    name: `${projectId} ${versionNumber}`,
    version_number: versionNumber,
    version_type: 'release',
    status: 'listed',
    loaders: ['paper'],
    game_versions: ['1.21.4'],
    date_published: '2026-01-01T00:00:00Z',
    dependencies,
    files: [
      {
        primary: true,
        filename: `${projectId}-${versionNumber}.jar`,
        size: 1,
        url: `https://example.invalid/${projectId}-${versionNumber}.jar`,
        hashes: { sha1: `sha1-${projectId}`, sha512: `sha512-${projectId}` },
      },
    ],
  }
}

// Looked up by ID or slug, as Modrinth does
const projects = [
  { id: 'cb', slug: 'craftbook', title: 'CraftBook' },
  { id: 'we', slug: 'worldedit', title: 'WorldEdit' },
  { id: 'fawe', slug: 'fastasyncworldedit', title: 'FastAsyncWorldEdit' },
]
const catalogue: Record<string, ReturnType<typeof version>[]> = {
  cb: [version('cb', '5.0.0', [{ project_id: 'we', version_id: null, dependency_type: 'required' }])],
  we: [version('we', '7.4.5')],
  fawe: [version('fawe', '2.16.0')],
}

type FakeInit = { params: { path: Record<string, string> } }

function fakeModrinth(path: string, init: FakeInit) {
  const project = projects.find((p) => p.id === init.params.path['id|slug'] || p.slug === init.params.path['id|slug'])
  switch (path) {
    case '/project/{id|slug}':
      return Promise.resolve({ data: project })
    case '/project/{id|slug}/version':
      return Promise.resolve({ data: project ? catalogue[project.id] : [] })
    default:
      throw new Error(`Unexpected request to ${path}`)
  }
}

function requestedPaths() {
  return get.mock.calls.map(([path]) => path as string)
}

function requestedProjects() {
  return get.mock.calls.map(([, init]) => (init as FakeInit).params.path['id|slug'])
}

function withRule(modrinth: Plugins['all']['modrinth'] = {}, added: Plugins['added'] = {}): Plugins {
  return {
    version: 2,
    config: {
      loader: 'paper',
      gameVersion: '1.21.4',
      substitutes: { we: { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' } },
    },
    added,
    all: { modrinth, url: {} },
  }
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(fakeModrinth)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('addPlugin', () => {
  it('refuses a replaced project before looking up any version', async () => {
    const plugins = withRule()

    const error: unknown = await addPlugin(plugins, 'worldedit', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserError)
    expect((error as Error).message).toContain('fastasyncworldedit')
    expect((error as Error).message).toContain('`yarn run-cli substitute --remove worldedit`')
    expect(requestedPaths()).toEqual(['/project/{id|slug}'])
    expect(plugins.all.modrinth).toEqual({})
  })

  it('attaches a dependency to its locked substitute without resolving or bumping it', async () => {
    const plugins = withRule(
      { fawe: modrinthEntry({ slug: 'fastasyncworldedit', version: '2.15.4' }) },
      { 'modrinth:fastasyncworldedit': '2.15.4' },
    )

    expect(await addPlugin(plugins, 'craftbook', {})).toBe(true)

    expect(Object.keys(plugins.all.modrinth).sort()).toEqual(['cb', 'fawe'])
    expect(plugins.all.modrinth.fawe.version).toBe('2.15.4')
    expect(plugins.all.modrinth.fawe.dependedOnBy).toEqual(new Set(['cb']))
    expect(requestedProjects()).not.toContain('fawe')
    expect(requestedProjects()).not.toContain('we')
  })

  it('resolves the substitute when it is not locked yet', async () => {
    const plugins = withRule()

    await addPlugin(plugins, 'craftbook', {})

    expect(Object.keys(plugins.all.modrinth).sort()).toEqual(['cb', 'fawe'])
    expect(plugins.all.modrinth.fawe.version).toBe('2.16.0')
    expect(plugins.all.modrinth.fawe.dependedOnBy).toEqual(new Set(['cb']))
  })
})
