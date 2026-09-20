/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'fs/promises'
import z from 'zod'

import { allLoaders } from './sources/modrinth/loaders.js'
import { UserError, ValidationError } from './errors.js'

export const pluginsFileVersion = 2
export const defaultPluginsPath = './plugins.json'

/**
 * A declaration that one Modrinth project satisfies every required dependency on another, such as FastAsyncWorldEdit
 * standing in for WorldEdit. Stored in config.substitutes, keyed by the project ID of the project being replaced. The
 * slugs are only there so plugins.json stays readable, and so messages can name both projects without a request.
 */
export const substituteRule = z.object({
  slug: z.string(),
  substitute: z.string(),
  substituteSlug: z.string(),
})
export type SubstituteRule = z.infer<typeof substituteRule>

/** The server a plugins.json is for. Every plugin in it is resolved against this unless it records an override */
export const serverConfig = z.object({
  loader: z.enum(allLoaders),
  gameVersion: z.string(),
  substitutes: z.record(z.string(), substituteRule).optional(),
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

/**
 * The canonical form of `raw` as a directory inside the plugins folder: surrounding whitespace and a trailing slash
 * removed. Throws unless it's relative, / separated and free of . and .. segments, so an install can't write outside
 * the plugins folder.
 */
export function normalizeInstallPath(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  const segments = trimmed.split('/')
  if (trimmed.includes('\\') || segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new ValidationError(
      `Invalid path ${JSON.stringify(raw)}. It must name a directory inside the plugins folder, such as "PlaceholderAPI/expansions"`,
    )
  }
  return trimmed
}

/** Whether `path` is already what normalizeInstallPath returns for it, which is the only form the lockfile holds */
export function isCanonicalInstallPath(path: string): boolean {
  try {
    return normalizeInstallPath(path) === path
  } catch {
    return false
  }
}

/**
 * A directory inside the plugins folder, for a JAR the server loads from somewhere other than the plugins folder
 * itself, such as a PlaceholderAPI expansion
 */
export const installPath = z.string().refine(isCanonicalInstallPath, {
  message: 'must name a directory inside the plugins folder, relative and / separated, with no . or .. segment',
})

/** How a url plugin is installed differently from the default */
export const urlPluginOverrides = z.object({
  path: installPath.optional(),
})
export type UrlPluginOverrides = z.infer<typeof urlPluginOverrides>

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

/**
 * A plugin downloaded from a URL. It pins the file it was added with, so install can tell if the file behind the URL
 * changes. The version is a label the user gives, since a URL doesn't reliably say which version it points to.
 * pinnedAt records when the current file was pinned, by add or update, and is what show lists as the entry's date.
 */
export const urlPlugin = z.object({
  source: z.literal('url'),
  url: z.string(),
  version: z.string(),
  filename: z.string(),
  sha512: z.string(),
  size: z.number(),
  pinnedAt: z.string(),
  overrides: urlPluginOverrides.optional(),
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

/** Whether a lockfile entry is one the user added, rather than one pulled in as a dependency */
export function isAddedModrinthPlugin(plugins: Plugins, entry: ModrinthPlugin): boolean {
  return entry.slug !== null && `modrinth:${entry.slug}` in plugins.added
}

/** The slugs of the lockfile entries that depend on `entry`, sorted. Entries without a slug are named by their ID */
export function dependantNames(all: AllModrinthPlugins, entry: ModrinthPlugin): string[] {
  return [...entry.dependedOnBy].map((id) => all[id]?.slug ?? id).sort()
}

/**
 * Throws if the lockfile contains a project that a substitute rule replaces, since both it and its substitute would
 * then be installed. The commands never lock such a project, so this catches a plugins.json edited by hand, or a path
 * the commands missed. install runs it before touching the plugins folder.
 */
export function assertNoSubstitutedPluginsLocked(plugins: Plugins) {
  const problems = Object.entries(plugins.config.substitutes ?? {}).flatMap(([id, rule]) => {
    const entry = plugins.all.modrinth[id]
    if (!entry) return []

    const dependants = dependantNames(plugins.all.modrinth, entry)
    if (isAddedModrinthPlugin(plugins, entry) || dependants.length === 0) {
      return [
        `${rule.slug} is in plugins.json, but it's substituted by ${rule.substituteSlug}. Run \`yarn run-cli remove ${rule.slug}\``,
      ]
    }
    const names = dependants.join(', ')
    return [
      `${rule.slug} is in plugins.json as a dependency of ${names}, but it's substituted by ${rule.substituteSlug}. ` +
        `Remove and re-add ${names} to pick up ${rule.substituteSlug}, or run \`yarn run-cli substitute --remove ${rule.slug}\``,
    ]
  })
  if (problems.length > 0) throw new UserError(`Refusing to install:\n${problems.join('\n')}`)
}

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

export async function pluginsExist(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function loadPlugins(path: string): Promise<Plugins> {
  let str: string
  try {
    str = await fs.readFile(path, 'utf-8')
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'ENOENT') {
      throw new UserError(`No plugins.json found at ${path}. Run \`yarn run-cli init\` to create one there`)
    }
    throw e
  }

  let raw: unknown
  try {
    raw = JSON.parse(str)
  } catch (e) {
    throw new UserError(`${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Checked before parsing, so an old file gets a message saying what to do rather than a schema error
  const version = typeof raw === 'object' && raw !== null && 'version' in raw ? raw.version : undefined
  if (version !== pluginsFileVersion) {
    const found = typeof version === 'number' ? `version ${version}` : 'in an unrecognised format'
    throw new UserError(
      `${path} is ${found}, but this needs version ${pluginsFileVersion}. Delete ${path} and run \`yarn run-cli init\``,
    )
  }

  try {
    return plugins.decode(raw as z.input<typeof plugins>)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const message = 'prettifyError' in z ? z.prettifyError(e) : e.message
      throw new UserError(`plugins.json doesn't match the expected format: ${message}`)
    }
    throw e
  }
}

export async function writePlugins(pluginsObj: Plugins, path: string) {
  pluginsObj = sortObj(pluginsObj)
  await fs.writeFile(path, JSON.stringify(plugins.encode(pluginsObj), null, 2))
}
