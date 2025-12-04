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
})
export type Plugin = z.infer<typeof plugin>

export const plugins = z.object({
  added: z.record(z.string(), z.string()),
  all: z.array(plugin),
})
export type Plugins = z.infer<typeof plugins>

export async function loadPlugins() {
  try {
    const str = await fs.readFile('./plugins.json')
    const raw = JSON.parse(str.toString())
    return plugins.parse(raw)
  } catch (e) {
    if ('code' in (e as any) && (e as any).code === 'ENOENT') {
      return { added: {}, all: [] }
    } else throw e
  }
}

export async function writePlugins(plugins: Plugins) {
  const copy = { ...plugins }
  copy.all = plugins.all.toSorted((p1, p2) => (p1.slug ?? p1.id).localeCompare(p2.slug ?? p2.id))
  copy.added = {}

  Object.entries(plugins.added)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .forEach(([k, v]) => (copy.added[k] = v))
  await fs.writeFile('./plugins.json', JSON.stringify(plugins, null, 2))
}
