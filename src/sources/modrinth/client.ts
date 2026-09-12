import createClient, { type Middleware } from 'openapi-fetch'

import type { paths } from './modrinth.js'
import { RatelimitError } from '../../errors.js'

// Cloudflare statuses for responses served from its cache without contacting Modrinth. These replay the ratelimit
// headers stored with the cached response, which describe whoever filled the cache rather than us
const servedFromCache = new Set(['HIT', 'STALE', 'UPDATING'])

const handleRatelimitMiddleware: () => Middleware = () => {
  let ratelimitLimit = 300
  let remainingRequests = ratelimitLimit
  let ratelimitResets = 0
  let requestsInFlight = 0

  return {
    onRequest() {
      // The window has reset since the last response that told us our quota, so it's full again
      if (Date.now() >= ratelimitResets) remainingRequests = ratelimitLimit

      if (remainingRequests - requestsInFlight <= 0) {
        const resetsIn = (ratelimitResets - Date.now()) / 1000
        throw new RatelimitError(`Ratelimit hit, wait ${resetsIn} seconds before trying again`)
      }
      requestsInFlight += 1
    },
    onResponse({ response }) {
      function getIntHeaderAnd(header: string, f: (header: number) => void) {
        const value = response.headers.get(header)
        // Some responses lack the headers entirely, and Number(null) is 0 rather than NaN
        if (!value) return

        const num = Number(value)
        if (!isNaN(num)) f(num)
      }
      requestsInFlight -= 1

      if (servedFromCache.has(response.headers.get('cf-cache-status') ?? '')) return

      getIntHeaderAnd('X-Ratelimit-Limit', (limit) => (ratelimitLimit = limit))
      getIntHeaderAnd('X-Ratelimit-Remaining', (remaining) => (remainingRequests = remaining))
      getIntHeaderAnd('X-Ratelimit-Reset', (resets) => (ratelimitResets = Date.now() + resets * 1000))
    },
    onError() {
      requestsInFlight -= 1
    },
  }
}

const client = createClient<paths>({
  baseUrl: 'https://api.modrinth.com/v2/',
  headers: {
    'User-Agent': 'Yukkuricraft/PluginsUtils',
  },
})
client.use(handleRatelimitMiddleware())

export default client
