import fs from 'fs/promises'
import z from 'zod'

export const plugin = z.object({
  slug: z.string().nullable(),
  id: z.string(),
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
export type Plugin = z.infer<typeof plugin>

export const plugins = z.object({
  added: z.record(z.string(), z.string()),
  all: z.array(plugin),
})
export type Plugins = z.infer<typeof plugins>

function sortObj<A extends object>(obj: A) {
  const res = {} as A
  Object.entries(obj)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .forEach(([k, v]) => (res[k as keyof A] = v))
  return res
}

export async function loadPlugins() {
  try {
    const str = await fs.readFile('./plugins.json')
    const raw = JSON.parse(str.toString())
    return plugins.decode(raw)
  } catch (e) {
    if ('code' in (e as any) && (e as any).code === 'ENOENT') {
      return { added: {}, all: [] }
    } else throw e
  }
}

export async function writePlugins(pluginsObj: Plugins) {
  const copy = { ...pluginsObj }
  copy.all = pluginsObj.all.toSorted((p1, p2) => (p1.slug ?? p1.id).localeCompare(p2.slug ?? p2.id)).map(sortObj)
  copy.added = sortObj(pluginsObj.added)
  await fs.writeFile('./plugins.json', JSON.stringify(plugins.encode(copy), null, 2))
}
