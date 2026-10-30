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
  it('keeps the most loader-specific build of each version number, newest first', async () => {
    const tagged = (id: string, versionNumber: string, loaders: string[], publishedAt: string) =>
      ({ id, version_number: versionNumber, loaders, status: 'listed', date_published: publishedAt }) as Version
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
})
