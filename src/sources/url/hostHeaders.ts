import { type HostTable } from '../../utils/files.js'

/**
 * Headers the url source sends to hosts that need more than a plain GET, keyed by `URL.host`. What a host needs is a
 * fact about the host rather than the server, so it lives here rather than in plugins.json. Secrets come from
 * environment variables.
 */
export const hostHeaders: HostTable = {
  // A release asset in a private GitHub repo can only be downloaded through the API, with a token that can read the
  // repo. The API describes the asset in JSON unless it's asked for application/octet-stream
  'api.github.com': {
    headers: () => {
      const accept = { Accept: 'application/octet-stream' }
      const token = process.env.GITHUB_TOKEN
      return token ? { ...accept, Authorization: `Bearer ${token}` } : accept
    },
    help: 'Private repos need GITHUB_TOKEN set to a token that can read the repo',
  },
}
