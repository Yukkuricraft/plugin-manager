import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NoCompatibleVersionError } from '../../../src/errors.js'
import { type AllModrinthPlugins } from '../../../src/pluginList.js'
import { modrinthEntry } from '../../testFixtures.js'
import { output } from '../../../src/utils/output.js'
import {
  addRequiredDependencies,
  carryOverPlugins,
  type DependencyContext,
  type DependencyInfo,
  getDependencyInfo,
  getPluginVersion,
} from '../../../src/sources/modrinth/utils.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))

function requiredDep(projectId: string, version: string): DependencyInfo {
  return {
    type: 'required',
    projectId,
    projectSlug: projectId,
    version,
    versionId: `${projectId}-${version}`,
    sha512: null,
    sha1: null,
    size: 1,
    filename: `${projectId}-${version}.jar`,
    publishedAt: '2026-01-01T00:00:00Z',
    dependencies: [],
  }
}

type Dependency = { project_id: string; version_id: string | null; dependency_type: 'required' | 'optional' }

function version(projectId: string, versionNumber: string, dependencies: Dependency[] = []) {
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

// Every version each fake project has. craftbook requires "we" (WorldEdit), which a rule replaces with "fawe"
const catalogue: Record<string, ReturnType<typeof version>[]> = {
  craftbook: [version('craftbook', '5.0.0', [{ project_id: 'we', version_id: null, dependency_type: 'required' }])],
  we: [version('we', '7.4.5')],
  fawe: [version('fawe', '2.16.0')],
  lib: [version('lib', '1.0.0')],
}

type FakeInit = { params: { path: Record<string, string> } }

/** Stands in for the Modrinth client's GET, answering from the catalogue. Unknown endpoints throw */
function fakeModrinth(path: string, init: FakeInit) {
  const id = init.params.path['id|slug']
  switch (path) {
    case '/project/{id|slug}':
      return Promise.resolve({ data: { id, slug: id } })
    case '/project/{id|slug}/version':
      return Promise.resolve({ data: catalogue[id] ?? [] })
    case '/project/{id|slug}/version/{id|number}':
      return Promise.resolve({ data: (catalogue[id] ?? []).find((v) => v.id === init.params.path['id|number']) })
    default:
      throw new Error(`Unexpected request to ${path}`)
  }
}

/** The endpoint and project of every request made so far */
function requests() {
  return get.mock.calls.map(([path, init]) => ({
    path: path as string,
    project: (init as FakeInit).params.path['id|slug'],
  }))
}

const worldeditToFawe: DependencyContext['substitutes'] = {
  we: { slug: 'worldedit', substitute: 'fawe', substituteSlug: 'fastasyncworldedit' },
}

function required(projectId: string, versionId: string | null = null) {
  return { project_id: projectId, version_id: versionId, dependency_type: 'required' as const }
}

describe('getPluginVersion', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('throws NoCompatibleVersionError naming every filter when nothing survives them', async () => {
    get.mockResolvedValue({
      data: [
        {
          id: 'a',
          version_number: '1.0.0',
          status: 'listed',
          loaders: ['fabric'],
          version_type: 'release',
          date_published: '2026-01-01T00:00:00Z',
        },
      ],
    })

    const error: unknown = await getPluginVersion('proj', 'paper', {
      name: 'someplugin',
      gameVersion: '1.21.4',
      featured: true,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NoCompatibleVersionError)
    expect(error).toMatchObject({
      projectId: 'proj',
      projectName: 'someplugin',
      loader: 'paper',
      gameVersion: '1.21.4',
      featured: true,
      message:
        'No paper versions found for plugin someplugin supporting Minecraft 1.21.4, among featured versions only',
    })
  })

  it('names the project by its id when given no name', async () => {
    get.mockResolvedValue({ data: [] })
    await expect(getPluginVersion('proj', 'paper')).rejects.toThrow('No paper versions found for plugin proj')
  })
})

describe('getDependencyInfo', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockImplementation(fakeModrinth)
  })

  it('resolves the substitute for a required dependency on a replaced project', async () => {
    const info = await getDependencyInfo(required('we'), 'paper', '1.21.4', { substitutes: worldeditToFawe })

    expect(info).toMatchObject({ type: 'required', projectId: 'fawe', version: '2.16.0' })
    expect(requests().map((r) => r.project)).not.toContain('we')
  })

  it('drops a version pin on a replaced project, with a warning', async () => {
    const warning = vi.spyOn(output, 'warning').mockImplementation(() => undefined)

    const info = await getDependencyInfo(required('we', 'we-7.4.5'), 'paper', '1.21.4', {
      substitutes: worldeditToFawe,
    })

    expect(info).toMatchObject({ type: 'required', projectId: 'fawe', version: '2.16.0' })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('fastasyncworldedit'))
    expect(requests().map((r) => r.path)).not.toContain('/project/{id|slug}/version/{id|number}')
  })

  it('reuses a locked dependency without making any request', async () => {
    const locked: AllModrinthPlugins = {
      fawe: modrinthEntry({ slug: 'fastasyncworldedit', version: '2.15.4', versionId: 'v', filename: 'FAWE.jar' }),
    }

    const info = await getDependencyInfo(required('fawe'), 'paper', '1.21.4', { locked })

    expect(get).not.toHaveBeenCalled()
    expect(info).toEqual({
      type: 'required',
      projectSlug: 'fastasyncworldedit',
      projectId: 'fawe',
      version: '2.15.4',
      versionId: 'v',
      sha512: null,
      sha1: null,
      size: 1,
      filename: 'FAWE.jar',
      publishedAt: '2025-01-01T00:00:00Z',
      dependencies: [],
    })
  })

  it('reuses a locked substitute', async () => {
    const locked: AllModrinthPlugins = { fawe: modrinthEntry({ slug: 'fastasyncworldedit', version: '2.15.4' }) }

    const info = await getDependencyInfo(required('we'), 'paper', '1.21.4', { substitutes: worldeditToFawe, locked })

    expect(get).not.toHaveBeenCalled()
    expect(info).toMatchObject({ projectId: 'fawe', version: '2.15.4' })
  })

  it('still fetches a pinned dependency that is locked', async () => {
    const locked: AllModrinthPlugins = { lib: modrinthEntry({ slug: 'lib', version: '0.9.0' }) }

    const info = await getDependencyInfo(required('lib', 'lib-1.0.0'), 'paper', '1.21.4', { locked })

    expect(info).toMatchObject({ projectId: 'lib', version: '1.0.0' })
    expect(requests().map((r) => r.path)).toContain('/project/{id|slug}/version/{id|number}')
  })

  it.each(['optional', 'incompatible'] as const)(
    'leaves $type dependencies on a replaced project alone',
    async (type) => {
      const info = await getDependencyInfo(
        { project_id: 'we', version_id: null, dependency_type: type },
        'paper',
        '1.21.4',
        { substitutes: worldeditToFawe },
      )

      expect(info).toMatchObject({ type, projectId: 'we' })
    },
  )

  it.each(['optional', 'incompatible'] as const)(
    'resolves no version for $type dependencies, so a project with no build for this server is fine',
    async (type) => {
      // "clientmod" isn't in the catalogue, so a version lookup would find nothing and throw
      const info = await getDependencyInfo(
        { project_id: 'clientmod', version_id: null, dependency_type: type },
        'paper',
        '1.21.4',
      )

      expect(info).toEqual({ type, projectSlug: 'clientmod', projectId: 'clientmod', versionId: null })
      expect(requests().map((r) => r.path)).toEqual(['/project/{id|slug}'])
    },
  )

  it('keeps the pinned build of an incompatible dependency, without fetching it', async () => {
    const info = await getDependencyInfo(
      { project_id: 'lib', version_id: 'lib-1.0.0', dependency_type: 'incompatible' },
      'paper',
      '1.21.4',
    )

    expect(info).toEqual({ type: 'incompatible', projectSlug: 'lib', projectId: 'lib', versionId: 'lib-1.0.0' })
    expect(requests().map((r) => r.path)).toEqual(['/project/{id|slug}'])
  })

  it('applies rules to the dependencies of a resolved plugin', async () => {
    const { dependencies } = await getPluginVersion('craftbook', 'paper', {
      gameVersion: '1.21.4',
      dependencyContext: { substitutes: worldeditToFawe },
    })

    expect(dependencies).toHaveLength(1)
    expect(dependencies[0]).toMatchObject({ type: 'required', projectId: 'fawe' })
  })
})

describe('addRequiredDependencies', () => {
  it('keeps the overrides of an entry it replaces with a newer build', () => {
    const plugins: AllModrinthPlugins = {
      worldedit: modrinthEntry({ slug: 'worldedit', version: '7.3.0', overrides: { loader: 'spigot' } }),
    }
    addRequiredDependencies(plugins, [{ dep: requiredDep('worldedit', '7.4.5'), dependant: 'worldguard' }])

    expect(plugins.worldedit.version).toBe('7.4.5')
    expect(plugins.worldedit.overrides).toEqual({ loader: 'spigot' })
    expect(plugins.worldedit.dependedOnBy).toEqual(new Set(['worldguard']))
  })

  it('keeps an entry already at a newer build, only recording the dependant', () => {
    const plugins: AllModrinthPlugins = { worldedit: modrinthEntry({ slug: 'worldedit', version: '7.5.0' }) }
    addRequiredDependencies(plugins, [{ dep: requiredDep('worldedit', '7.4.5'), dependant: 'worldguard' }])

    expect(plugins.worldedit.version).toBe('7.5.0')
    expect(plugins.worldedit.dependedOnBy).toEqual(new Set(['worldguard']))
  })

  it('leaves a reused locked entry as it is, only recording the dependant', async () => {
    get.mockReset().mockImplementation(fakeModrinth)
    const plugins: AllModrinthPlugins = {
      fawe: modrinthEntry({ slug: 'fastasyncworldedit', version: '2.15.4', sha512: 'locked-hash' }),
    }
    const dep = await getDependencyInfo(required('fawe'), 'paper', '1.21.4', { locked: plugins })
    addRequiredDependencies(plugins, [{ dep, dependant: 'craftbook' }])

    expect(plugins.fawe.version).toBe('2.15.4')
    expect(plugins.fawe.sha512).toBe('locked-hash')
    expect(plugins.fawe.dependedOnBy).toEqual(new Set(['craftbook']))
  })

  it('keeps the dependants and overrides of a reused entry whose version is not semver', async () => {
    get.mockReset().mockImplementation(fakeModrinth)
    const plugins: AllModrinthPlugins = {
      snap: modrinthEntry({
        slug: 'snap',
        version: 'snapshot',
        dependedOnBy: new Set(['other']),
        overrides: { loader: 'spigot' },
      }),
    }
    const dep = await getDependencyInfo(required('snap'), 'paper', '1.21.4', { locked: plugins })
    addRequiredDependencies(plugins, [{ dep, dependant: 'craftbook' }])

    expect(plugins.snap.version).toBe('snapshot')
    expect(plugins.snap.overrides).toEqual({ loader: 'spigot' })
    expect(plugins.snap.dependedOnBy).toEqual(new Set(['other', 'craftbook']))
  })
})

describe('carryOverPlugins', () => {
  it('copies a plugin with its whole dependency subtree, and nothing else', () => {
    const from: AllModrinthPlugins = {
      kept: modrinthEntry({ slug: 'kept' }),
      dep: modrinthEntry({ slug: 'dep', dependedOnBy: new Set(['kept']) }),
      depOfDep: modrinthEntry({ slug: 'depOfDep', dependedOnBy: new Set(['dep']) }),
      unrelated: modrinthEntry({ slug: 'unrelated' }),
    }
    const into: AllModrinthPlugins = {}
    carryOverPlugins(from, into, ['kept'])

    expect(Object.keys(into).sort()).toEqual(['dep', 'depOfDep', 'kept'])
    expect(into.depOfDep.dependedOnBy).toEqual(new Set(['dep']))
  })

  it('leaves a dependency already resolved in place, only adding the carried dependant', () => {
    const from: AllModrinthPlugins = {
      kept: modrinthEntry({ slug: 'kept' }),
      shared: modrinthEntry({ slug: 'shared', version: '1.0.0', dependedOnBy: new Set(['kept', 'updated']) }),
    }
    const into: AllModrinthPlugins = {
      shared: modrinthEntry({ slug: 'shared', version: '2.0.0', dependedOnBy: new Set(['updated']) }),
    }
    carryOverPlugins(from, into, ['kept'])

    expect(into.shared.version).toBe('2.0.0')
    expect(into.shared.dependedOnBy).toEqual(new Set(['updated', 'kept']))
  })

  it('drops dependants that are not carried over, since they re-register themselves', () => {
    const from: AllModrinthPlugins = {
      kept: modrinthEntry({ slug: 'kept' }),
      shared: modrinthEntry({ slug: 'shared', dependedOnBy: new Set(['kept', 'updated']) }),
    }
    const into: AllModrinthPlugins = {}
    carryOverPlugins(from, into, ['kept'])

    expect(into.shared.dependedOnBy).toEqual(new Set(['kept']))
  })

  it('does not share dependedOnBy sets with the source', () => {
    const from: AllModrinthPlugins = { kept: modrinthEntry({ slug: 'kept' }) }
    const into: AllModrinthPlugins = {}
    carryOverPlugins(from, into, ['kept'])
    into.kept.dependedOnBy.add('someone')

    expect(from.kept.dependedOnBy.size).toBe(0)
  })

  it('does not pull in the old dependency of a plugin that was resolved fresh', () => {
    const from: AllModrinthPlugins = {
      kept: modrinthEntry({ slug: 'kept' }),
      dependency: modrinthEntry({ slug: 'dependency', version: '1.0.0', dependedOnBy: new Set(['kept']) }),
      oldTransitiveDep: modrinthEntry({ slug: 'oldTransitiveDep', dependedOnBy: new Set(['dependency']) }),
    }
    const into: AllModrinthPlugins = {
      dependency: modrinthEntry({ slug: 'dependency', version: '2.0.0', dependedOnBy: new Set() }),
    }
    carryOverPlugins(from, into, ['kept'])

    expect(Object.keys(into).sort()).toEqual(['dependency', 'kept'])
    expect(into.dependency.version).toBe('2.0.0')
    expect(into.dependency.dependedOnBy).toEqual(new Set(['kept']))
  })
})
