import fs from 'fs/promises'
import z from 'zod'

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

export async function loadPlugins(): Promise<Plugins> {
  try {
    const str = await fs.readFile('./plugins.json')
    const raw = JSON.parse(str.toString())
    return plugins.decode(raw)
  } catch (e) {
    if ('code' in (e as any) && (e as any).code === 'ENOENT') {
      return {
        added: {},
        all: {
          modrinth: {},
          url: {},
        },
      }
    } else throw e
  }
}

export async function writePlugins(pluginsObj: Plugins) {
  pluginsObj = sortObj(pluginsObj)
  await fs.writeFile('./plugins.json', JSON.stringify(plugins.encode(pluginsObj), null, 2))
}
