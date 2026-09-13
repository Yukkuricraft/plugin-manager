/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'fs/promises'
import z from 'zod'

import { allLoaders } from './sources/modrinth/loaders.js'
import { UserError } from './errors.js'

export const pluginsFileVersion = 2
export const defaultPluginsPath = './plugins.json'

/** The server a plugins.json is for. Every plugin in it is resolved against this unless it records an override */
export const serverConfig = z.object({
  loader: z.enum(allLoaders),
  gameVersion: z.string(),
})
export type ServerConfig = z.infer<typeof serverConfig>

/**
 * How a plugin was resolved differently from the server configuration. A loader override is sticky, and keeps being
 * used for that plugin. A Minecraft version override only records that the plugin lags the configuration, and update
 * tries to bring it up to date every time.
 */
export const pluginOverrides = z.object({
  loader: z.enum(allLoaders).optional(),
  gameVersion: z.string().optional(),
})
export type PluginOverrides = z.infer<typeof pluginOverrides>

export const modrinthPlugin = z.object({
  source: z.literal('modrinth'),
  slug: z.string().nullable(),
  version: z.string(),
  versionId: z.string(),
  sha512: z.string().nullable(),
  sha1: z.string().nullable(),
  size: z.number(),
  filename: z.string(),
  publishedAt: z.string(),
  dependedOnBy: z.codec(z.array(z.string()), z.set(z.string()), {
    encode(v) {
      return [...v]
    },
    decode(v) {
      return new Set(v)
    },
  }),
  overrides: pluginOverrides.optional(),
})
export type ModrinthPlugin = z.infer<typeof modrinthPlugin>

export const allModrinthPlugins = z.record(z.string(), modrinthPlugin)
export type AllModrinthPlugins = z.infer<typeof allModrinthPlugins>

export const urlPlugin = z.object({
  source: z.literal('url'),
  url: z.string(),
})
export type UrlPlugin = z.infer<typeof urlPlugin>

export const allUrlPlugins = z.record(z.string(), urlPlugin)
export type AllUrlPlugins = z.infer<typeof allUrlPlugins>

export const plugin = z.discriminatedUnion('source', [modrinthPlugin, urlPlugin])
export type Plugin = z.infer<typeof plugin>

export const allPlugins = z.object({
  modrinth: allModrinthPlugins,
  url: allUrlPlugins,
})
export type AllPlugins = z.infer<typeof allPlugins>

export const plugins = z.object({
  version: z.literal(pluginsFileVersion),
  config: serverConfig,
  added: z.record(z.templateLiteral([z.enum(['modrinth', 'url']), ':', z.string()]), z.string()),
  all: allPlugins,
})
export type Plugins = z.infer<typeof plugins>

function sortObj<A extends object>(obj: A): A {
  const res = {} as A
  Object.entries(obj)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .forEach(([k, v]) => {
      if (typeof v === 'object' && v && Object.getPrototypeOf(v) === Object.prototype) {
        v = sortObj(v)
      }

      res[k as keyof A] = v
    })
  return res
}

export async function pluginsExist(path = defaultPluginsPath): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function loadPlugins(path = defaultPluginsPath): Promise<Plugins> {
  let str: string
  try {
    str = await fs.readFile(path, 'utf-8')
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'ENOENT') {
      throw new UserError('No plugins.json found. Run `yarn run-cli init` to create one')
    }
    throw e
  }

  // Checked before parsing, so an old file gets a message saying what to do rather than a schema error
  const raw: unknown = JSON.parse(str)
  const version = typeof raw === 'object' && raw !== null && 'version' in raw ? raw.version : undefined
  if (version !== pluginsFileVersion) {
    const found = typeof version === 'number' ? `version ${version}` : 'in an unrecognised format'
    throw new UserError(
      `plugins.json is ${found}, but this needs version ${pluginsFileVersion}. Delete plugins.json and run \`yarn run-cli init\``,
    )
  }
  return plugins.decode(raw as z.input<typeof plugins>)
}

export async function writePlugins(pluginsObj: Plugins, path = defaultPluginsPath) {
  pluginsObj = sortObj(pluginsObj)
  await fs.writeFile(path, JSON.stringify(plugins.encode(pluginsObj), null, 2))
}
