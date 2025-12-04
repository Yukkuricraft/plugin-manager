import createClient from 'openapi-fetch'
import type { paths } from './modrinth.js'

// TODO: Middleware to handle ratelimit
// TODO: User agent
export default createClient<paths>({ baseUrl: 'https://api.modrinth.com/v2/' })