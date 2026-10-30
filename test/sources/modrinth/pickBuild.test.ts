import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type components } from '../../../src/sources/modrinth/modrinth.js'
import { listBuilds, pickBuild } from '../../../src/sources/modrinth/pickBuild.js'

const { get, select } = vi.hoisted(() => ({ get: vi.fn(), select: vi.fn() }))
vi.mock('../../../src/sources/modrinth/client.js', () => ({ default: { GET: get } }))
vi.mock('@inquirer/prompts', () => ({ select }))

type Version = components['schemas']['Version']

function build(id: string, versionType: 'release' | 'beta' | 'alpha', publishedAt: string): Version {
  return {
    id,
    project_id: 'p',
    version_number: id,
    version_type: versionType,
    date_published: publishedAt,
    files: [],
  } as unknown as Version
}

interface SelectArgs {
  choices: { name: string; value: Version }[]
  default: Version
}

function selectArgs(): SelectArgs {
  return select.mock.calls[0][0] as SelectArgs
}

beforeEach(() => {
  select.mockReset().mockImplementation((args: SelectArgs) => Promise.resolve(args.default))
})

describe('pickBuild', () => {
  it('defaults to the newest release when a newer beta exists', async () => {
    const beta = build('2.0.0-beta', 'beta', '2026-02-01T00:00:00Z')
    const release = build('1.9.0', 'release', '2026-01-01T00:00:00Z')

    expect(await pickBuild('p', [beta, release], 'other')).toBe(release)
  })

  it('defaults to the newest beta with no release', async () => {
    const newer = build('2.0.0-beta.2', 'beta', '2026-02-01T00:00:00Z')
    const older = build('2.0.0-beta.1', 'beta', '2026-01-01T00:00:00Z')

    expect(await pickBuild('p', [newer, older], 'other')).toBe(newer)
  })

  it('shows each build with its channel and date, marking the current one', async () => {
    const beta = build('2.0.0-beta', 'beta', '2026-02-01T12:00:00Z')
    const release = build('1.9.0', 'release', '2026-01-01T00:00:00Z')

    await pickBuild('p', [beta, release], '1.9.0')

    expect(selectArgs().choices.map((c) => c.name)).toEqual([
      '2.0.0-beta  beta  2026-02-01',
      '1.9.0  release  2026-01-01  (current)',
    ])
  })
})

describe('listBuilds', () => {
  const tagged = (
    id: string,
    versionNumber: string,
    loaders: string[],
    publishedAt: string,
    status: 'listed' | 'unlisted' = 'listed',
  ) => ({ id, version_number: versionNumber, loaders, status, date_published: publishedAt }) as Version

  it('asks Modrinth for the builds of the Minecraft version', async () => {
    get.mockResolvedValue({ data: [] })

    await listBuilds('fawe', 'paper', '1.21.4')

    expect(get).toHaveBeenCalledWith('/project/{id|slug}/version', {
      params: { path: { 'id|slug': 'fawe' }, query: { game_versions: '["1.21.4"]' } },
    })
  })

  it('sorts the builds newest first', async () => {
    get.mockResolvedValue({
      data: [
        tagged('b', '2', ['paper'], '2026-02-01T00:00:00Z'),
        tagged('a', '1', ['paper'], '2026-01-01T00:00:00Z'),
        tagged('c', '3', ['paper'], '2026-03-01T00:00:00Z'),
      ],
    })

    expect((await listBuilds('fawe', 'paper', '1.21.4')).map((b) => b.id)).toEqual(['c', 'b', 'a'])
  })

  it('leaves out unlisted builds and builds for other loaders', async () => {
    get.mockResolvedValue({
      data: [
        tagged('hidden', '2', ['paper'], '2026-02-01T00:00:00Z', 'unlisted'),
        tagged('fabric', '3', ['fabric'], '2026-03-01T00:00:00Z'),
        tagged('shown', '1', ['paper'], '2026-01-01T00:00:00Z'),
      ],
    })

    expect((await listBuilds('fawe', 'paper', '1.21.4')).map((b) => b.id)).toEqual(['shown'])
  })

  it('keeps the most loader-specific build of each version number, newest first', async () => {
    get.mockResolvedValue({
      data: [
        tagged('old', '2.15.0', ['paper', 'spigot'], '2026-01-01T00:00:00Z'),
        tagged('generic', '2.15.1', ['paper', 'spigot'], '2026-02-01T00:00:00Z'),
        tagged('paper', '2.15.1', ['paper'], '2026-02-01T00:00:00Z'),
      ],
    })

    const builds = await listBuilds('fawe', 'paper', '1.21.4')

    expect(builds.map((b) => b.id)).toEqual(['paper', 'old'])
  })

  it('keeps the current build over a more loader-specific one with its version number', async () => {
    get.mockResolvedValue({
      data: [
        tagged('generic', '2.15.1', ['paper', 'spigot'], '2026-02-01T00:00:00Z'),
        tagged('paper', '2.15.1', ['paper'], '2026-02-01T00:00:00Z'),
      ],
    })

    const builds = await listBuilds('fawe', 'paper', '1.21.4', 'generic')

    expect(builds.map((b) => b.id)).toEqual(['generic'])
  })
})
