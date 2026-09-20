import { afterEach, describe, expect, it, vi } from 'vitest'

import { hostHeaders } from '../../../src/sources/url/hostHeaders.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hostHeaders', () => {
  it('asks api.github.com for the file rather than its JSON description, with no token set', () => {
    vi.stubEnv('GITHUB_TOKEN', '')

    expect(hostHeaders['api.github.com'].headers()).toEqual({ Accept: 'application/octet-stream' })
  })

  it('sends GITHUB_TOKEN as a bearer token, reading it on each call', () => {
    vi.stubEnv('GITHUB_TOKEN', 'first')
    expect(hostHeaders['api.github.com'].headers()).toEqual({
      Accept: 'application/octet-stream',
      Authorization: 'Bearer first',
    })

    vi.stubEnv('GITHUB_TOKEN', 'second')
    expect(hostHeaders['api.github.com'].headers().Authorization).toBe('Bearer second')
  })

  it('says what a failed request to api.github.com probably needs', () => {
    expect(hostHeaders['api.github.com'].help).toContain('GITHUB_TOKEN')
  })
})
