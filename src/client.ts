import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './modrinth.js'

const handleRatelimitMiddleware: () => Middleware = () => {
  let ratelimitLimit = 300
  let remainingRequests = ratelimitLimit
  let ratelimitResets = 0
  let requestsInFlight = 0

  return {
    onRequest() {
      if (remainingRequests - requestsInFlight <= 0) {
        const resetsIn = (Date.now() - ratelimitResets) / 1000
        throw new Error(`Ratelimit hit, wait ${resetsIn} seconds before trying again`)
      }
      requestsInFlight += 1
    },
    onResponse({ response }) {
      function getIntHeaderAnd(header: string, f: (header: number) => void) {
        const num = Number(response.headers.get(header))
        if (!isNaN(num)) f(num)
      }
      requestsInFlight -= 1

      getIntHeaderAnd('X-Ratelimit-Limit', (limit) => (ratelimitLimit = limit))
      getIntHeaderAnd('X-Ratelimit-Remaining', (remaining) => (remainingRequests = remaining))
      getIntHeaderAnd('X-Ratelimit-Reset', (resets) => (ratelimitResets = Date.now() + resets * 1000))
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
