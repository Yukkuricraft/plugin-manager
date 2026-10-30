import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SanityCheckError, UserError } from '../../../src/errors.js'
import { pickAsset, pickRelease } from '../../../src/sources/ghRelease/pick.js'
import { asset, release } from './fixtures.js'

type Choice = { name: string; value: unknown }
type SelectArgs = { default?: unknown; choices: Choice[] }

const { select } = vi.hoisted(() => ({ select: vi.fn<(args: SelectArgs) => Promise<unknown>>() }))
vi.mock('@inquirer/prompts', () => ({ select }))

beforeEach(() => select.mockReset())

describe('pickRelease', () => {
  const newer = release('grief/3.1.11', '2025-02-01T00:00:00Z')
  const older = release('grief/3.1.10', '2025-01-01T00:00:00Z')

  it('lists releases in order, defaulting to the first and marking the current one', async () => {
    select.mockResolvedValue(older)

    const picked = await pickRelease('grief', [newer, older], 'grief/3.1.10')

    expect(picked).toBe(older)
    const [arg] = select.mock.calls[0]
    expect(arg.default).toBe(newer)
    expect(arg.choices.map((c) => c.value)).toEqual([newer, older])
    expect(arg.choices[0].name).toBe('grief/3.1.11  2025-02-01')
    expect(arg.choices[1].name).toBe('grief/3.1.10  2025-01-01  (current)')
  })

  it('tells the user to publish when nothing matches', async () => {
    const call = pickRelease('grief', [])
    await expect(call).rejects.toThrow(UserError)
    await expect(call).rejects.toThrow(/publish/)
    await expect(call).rejects.toThrow(/grief\//)
  })

  it('rejects a release without a publish date', async () => {
    const undated = { ...newer, published_at: null }
    await expect(pickRelease('grief', [undated])).rejects.toThrow(SanityCheckError)
  })
})

describe('pickAsset', () => {
  it('returns a lone asset without asking', async () => {
    const only = asset('a.jar')
    expect(await pickAsset(release('x/1', '2025-01-01T00:00:00Z', [only]))).toBe(only)
    expect(select).not.toHaveBeenCalled()
  })

  it('asks by asset name when there are several', async () => {
    const a = asset('a.jar', 1)
    const b = asset('b.jar', 2)
    select.mockResolvedValue(b)

    expect(await pickAsset(release('x/1', '2025-01-01T00:00:00Z', [a, b]))).toBe(b)
    expect(select.mock.calls[0][0].choices.map((c) => c.name)).toEqual(['a.jar', 'b.jar'])
  })

  it('throws a UserError naming the tag when there are none', async () => {
    const call = pickAsset(release('x/1', '2025-01-01T00:00:00Z', []))
    await expect(call).rejects.toThrow(UserError)
    await expect(call).rejects.toThrow(/x\/1/)
  })
})
