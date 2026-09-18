import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../errors.js'
import { type Plugins } from '../../pluginList.js'
import { modrinthEntry } from '../../testFixtures.js'
import update from './update.js'

const { get, select } = vi.hoisted(() => ({ get: vi.fn(), select: vi.fn() }))
vi.mock('./client.js', () => ({ default: { GET: get } }))
vi.mock('@inquirer/prompts', () => ({ select }))

function modrinthVersion(projectId: string, versionNumber: string, gameVersions: string[], publishedAt: string) {
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
    dependencies: [],
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

// The full version history Modrinth would return for each fake project. "lag" has no build for
// Minecraft 1.21.4, so it can never resolve at that target; "cur" has one, so it can catch up.
const catalogue: Record<string, ReturnType<typeof modrinthVersion>[]> = {
  lag: [modrinthVersion('lag', '1.0.0', ['1.21.1'], '2025-06-01T00:00:00Z')],
  cur: [
    modrinthVersion('cur', '2.0.0', ['1.20.4', '1.21.1'], '2025-06-01T00:00:00Z'),
    modrinthVersion('cur', '2.1.0', ['1.21.4'], '2026-02-01T00:00:00Z'),
  ],
}

/**
 * Stands in for the real Modrinth client's GET. Only handles the version-list endpoint, since none of these
 * fixtures' versions have dependencies, so that's the only endpoint they ever reach; anything else throws
 * so a test would fail loudly instead of hitting the network. When the request carries a game_versions
 * filter, only versions matching one of the requested Minecraft versions are returned, matching how
 * Modrinth's API behaves.
 */
function fakeModrinth(
  path: string,
  init: { params: { path: Record<string, string>; query?: { game_versions?: string } } },
) {
  if (path !== '/project/{id|slug}/version') throw new Error(`Unexpected request to ${path}`)
  const versions = catalogue[init.params.path['id|slug']] ?? []
  const filter = init.params.query?.game_versions
  if (!filter) return Promise.resolve({ data: versions })

  const wanted = JSON.parse(filter) as string[]
  return Promise.resolve({ data: versions.filter((v) => v.game_versions.some((g) => wanted.includes(g))) })
}

function existingPlugins(): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.1' },
    added: { 'modrinth:lagging': '1.0.0', 'modrinth:current': '2.0.0' },
    all: {
      modrinth: {
        lag: modrinthEntry({ slug: 'lagging', version: '1.0.0', publishedAt: '2025-06-01T00:00:00Z' }),
        libdep: modrinthEntry({ slug: 'libdep', version: '0.1.0', dependedOnBy: new Set(['lag']) }),
        cur: modrinthEntry({
          slug: 'current',
          version: '2.0.0',
          publishedAt: '2025-06-01T00:00:00Z',
          overrides: { gameVersion: '1.20.4' },
        }),
      },
      url: {},
    },
  }
}

/**
 * Builds the empty `newPlugins` object update.ts receives as its second argument: the configuration already
 * pointed at the new Minecraft version, but with nothing resolved into it yet.
 */
function retargeted(existing: Plugins, gameVersion: string): Plugins {
  return { version: 2, config: { ...existing.config, gameVersion }, added: {}, all: { modrinth: {}, url: {} } }
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(fakeModrinth)
  select.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('update', () => {
  it('keeps a plugin that cannot reach the target, with its dependencies, recording that it lags', async () => {
    select.mockResolvedValue(true)
    const existing = existingPlugins()
    const next = retargeted(existing, '1.21.4')

    const result = await update(existing, next, { gameVersion: '1.21.4' })

    expect(next.all.modrinth.lag).toMatchObject({ version: '1.0.0', overrides: { gameVersion: '1.21.1' } })
    expect(next.all.modrinth.libdep.dependedOnBy).toEqual(new Set(['lag']))
    expect(next.added['modrinth:lagging']).toBe('1.0.0')
    expect(result.removed).toEqual([])
    expect(result.overrides).toContainEqual({ identifier: 'lagging', change: 'granted', gameVersion: '1.21.1' })
  })

  it('clears the override of a plugin that caught up with the target', async () => {
    select.mockResolvedValue(true)
    const existing = existingPlugins()
    const next = retargeted(existing, '1.21.4')

    const result = await update(existing, next, { gameVersion: '1.21.4' })

    expect(next.all.modrinth.cur.version).toBe('2.1.0')
    expect(next.all.modrinth.cur.overrides).toBeUndefined()
    expect(result.changed).toEqual([{ identifier: 'current', oldVersion: '2.0.0', newVersion: '2.1.0' }])
    expect(result.overrides).toContainEqual({ identifier: 'current', change: 'cleared', gameVersion: '1.20.4' })
  })

  it('says why a plugin is stuck, and how far behind it is, before asking', async () => {
    select.mockResolvedValue(true)
    const existing = existingPlugins()

    await update(existing, retargeted(existing, '1.21.4'), { gameVersion: '1.21.4' })

    expect(select).toHaveBeenCalledOnce()
    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain("lagging can't be updated to Minecraft 1.21.4")
    expect(printed).toContain('supports up to Minecraft 1.21.1')
  })

  it('aborts, naming the cause, when the user declines to keep a plugin', async () => {
    select.mockResolvedValue(false)
    const existing = existingPlugins()

    const error: unknown = await update(existing, retargeted(existing, '1.21.4'), { gameVersion: '1.21.4' }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(UserError)
    expect((error as Error).message).toContain('Update aborted, nothing was written')
    expect((error as Error).message).toContain("lagging can't be updated to Minecraft 1.21.4")
  })

  it('asks again about a plugin already held back, without recording a new override', async () => {
    select.mockResolvedValue(true)
    const existing = existingPlugins()
    existing.all.modrinth.lag.overrides = { gameVersion: '1.21.1' }
    const next = retargeted(existing, '1.21.4')

    const result = await update(existing, next, { gameVersion: '1.21.4' })

    expect(select).toHaveBeenCalledOnce()
    expect(next.all.modrinth.lag.overrides).toEqual({ gameVersion: '1.21.1' })
    expect(result.overrides.filter((o) => o.identifier === 'lagging')).toEqual([])
  })

  it('keeps a plugin with no compatible version at all, without recording an override, when the target is unchanged', async () => {
    select.mockResolvedValue(true)
    const existing: Plugins = {
      version: 2,
      config: { loader: 'paper', gameVersion: '1.21.1' },
      added: { 'modrinth:gone': '1.0.0' },
      all: { modrinth: { gone: modrinthEntry({ slug: 'gone', version: '1.0.0' }) }, url: {} },
    }
    const next = retargeted(existing, '1.21.1')

    const result = await update(existing, next, { gameVersion: '1.21.1' })

    expect(next.all.modrinth.gone).toMatchObject({ version: '1.0.0' })
    expect(next.all.modrinth.gone.overrides).toBeUndefined()
    expect(result.overrides).toEqual([])
    expect(select).toHaveBeenCalledOnce()
    const { message } = select.mock.calls[0][0] as { message: string }
    expect(message).not.toContain('recorded as lagging')
  })

  it('clears the override of a plugin already held back when the target lands exactly on its held-back version', async () => {
    select.mockResolvedValue(true)
    const existing: Plugins = {
      version: 2,
      config: { loader: 'paper', gameVersion: '1.21.4' },
      added: { 'modrinth:gone': '1.0.0' },
      all: {
        modrinth: { gone: modrinthEntry({ slug: 'gone', version: '1.0.0', overrides: { gameVersion: '1.21.1' } }) },
        url: {},
      },
    }
    const next = retargeted(existing, '1.21.1')

    const result = await update(existing, next, { gameVersion: '1.21.1' })

    expect(next.all.modrinth.gone).toMatchObject({ version: '1.0.0' })
    expect(next.all.modrinth.gone.overrides).toBeUndefined()
    expect(result.overrides).toContainEqual({ identifier: 'gone', change: 'cleared', gameVersion: '1.21.1' })
    expect(select).toHaveBeenCalledOnce()
    const { message } = select.mock.calls[0][0] as { message: string }
    expect(message).not.toContain('recorded as lagging')
  })
})
