import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NoCompatibleVersionError } from '../../errors.js'
import { type AllModrinthPlugins } from '../../pluginList.js'
import { modrinthEntry } from '../../testFixtures.js'
import { addRequiredDependencies, carryOverPlugins, type DependencyInfo, getPluginVersion } from './utils.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./client.js', () => ({ default: { GET: get } }))

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
