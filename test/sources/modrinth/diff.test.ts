import { describe, expect, it } from 'vitest'

import { diffModrinth } from '../../../src/sources/modrinth/diff.js'
import { modrinthEntry } from '../../testFixtures.js'

describe('diffModrinth', () => {
  it('lists removed, added and changed entries', () => {
    const before = {
      gone: modrinthEntry({ slug: 'gone' }),
      kept: modrinthEntry({ slug: 'kept', version: '1.0.0' }),
      bumped: modrinthEntry({ slug: 'bumped', version: '1.0.0' }),
    }
    const after = {
      kept: modrinthEntry({ slug: 'kept', version: '1.0.0' }),
      bumped: modrinthEntry({ slug: 'bumped', version: '1.1.0' }),
      fresh: modrinthEntry({ slug: null }),
    }

    expect(diffModrinth(before, after)).toEqual({
      removed: ['gone'],
      added: ['fresh'],
      changed: [{ identifier: 'bumped', oldVersion: '1.0.0', newVersion: '1.1.0' }],
    })
  })
})
