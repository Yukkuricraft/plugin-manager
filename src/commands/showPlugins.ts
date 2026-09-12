import { loadPlugins, type ModrinthPlugin, type Plugins } from '../pluginList.js'
import { formatSize, output, symbols } from '../utils/output.js'

type ModrinthEntry = {
  source: 'modrinth'
  name: string
  plugin: ModrinthPlugin
  requiredBy: string[]
  orphaned: boolean
}
type UrlEntry = { source: 'url'; name: string; url: string }
type Entry = ModrinthEntry | UrlEntry

function groupPlugins(pluginsObj: Plugins): { added: Entry[]; dependencies: Entry[] } {
  const modrinthPlugins = Object.entries(pluginsObj.all.modrinth)
  const nameById = new Map(modrinthPlugins.map(([id, p]) => [id, p.slug ?? id]))

  const added: Entry[] = []
  const dependencies: Entry[] = []

  for (const [id, plugin] of modrinthPlugins) {
    const requiredBy = [...plugin.dependedOnBy].map((d) => nameById.get(d) ?? d).sort()
    const isAdded = plugin.slug !== null && `modrinth:${plugin.slug}` in pluginsObj.added
    const entry: ModrinthEntry = {
      source: 'modrinth',
      name: plugin.slug ?? id,
      plugin,
      requiredBy,
      orphaned: !isAdded && requiredBy.length === 0,
    }
    ;(isAdded ? added : dependencies).push(entry)
  }

  for (const [id, plugin] of Object.entries(pluginsObj.all.url)) {
    added.push({ source: 'url', name: id, url: plugin.url })
  }

  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name)
  return { added: added.sort(byName), dependencies: dependencies.sort(byName) }
}

function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

function note(entry: ModrinthEntry) {
  if (entry.orphaned) return ` ${output.dim('(orphaned)')}`
  if (entry.requiredBy.length > 0) return ` ${output.dim(`← required by ${entry.requiredBy.join(', ')}`)}`
  return ''
}

function printCompact(entries: Entry[], widths: { name: number; version: number; size: number }) {
  for (const entry of entries) {
    if (entry.source === 'url') {
      const padding = ' '.repeat(widths.name - `${entry.name} (url)`.length)
      console.log(
        `  ${output.pluginName(`${symbols.plugin} ${entry.name}`)} ${output.dim('(url)')}${padding}  ${output.url(entry.url)}`,
      )
    } else {
      const { version, size, publishedAt } = entry.plugin
      console.log(
        `  ${output.pluginName(`${symbols.plugin} ${entry.name.padEnd(widths.name)}`)}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(publishedAt))}${note(entry)}`,
      )
    }
  }
}

function printVerbose(entries: Entry[]) {
  for (const entry of entries) {
    if (entry.source === 'url') {
      output.pluginCard({ title: entry.name, url: entry.url })
    } else {
      output.pluginCard({
        title: entry.orphaned ? `${entry.name} ${output.dim('(orphaned)')}` : entry.name,
        version: entry.plugin.version,
        filename: entry.plugin.filename,
        size: entry.plugin.size,
        publishedAt: entry.plugin.publishedAt,
        requiredBy: entry.requiredBy,
      })
    }
  }
}

export default async function showPlugins(verbose: boolean) {
  const { added, dependencies } = groupPlugins(await loadPlugins())

  const all = [...added, ...dependencies]
  if (all.length === 0) {
    output.info('No plugins in plugins.json')
    return
  }

  const modrinthEntries = all.filter((e): e is ModrinthEntry => e.source === 'modrinth')
  const widths = {
    name: Math.max(...all.map((e) => (e.source === 'url' ? `${e.name} (url)` : e.name).length)),
    version: Math.max(0, ...modrinthEntries.map((e) => e.plugin.version.length)),
    size: Math.max(0, ...modrinthEntries.map((e) => formatSize(e.plugin.size).length)),
  }

  const sections: [string, Entry[]][] = [
    ['Added', added],
    ['Dependencies', dependencies],
  ]
  let first = true
  for (const [title, entries] of sections) {
    if (entries.length === 0) continue
    if (!first) output.blank()
    first = false

    output.header(`${title} (${entries.length})`)
    if (verbose) printVerbose(entries)
    else printCompact(entries, widths)
  }

  const totalSize = modrinthEntries.reduce((sum, e) => sum + e.plugin.size, 0)
  const urlCount = all.length - modrinthEntries.length
  const excludes = urlCount > 0 ? ` (excludes ${urlCount} URL plugin${urlCount === 1 ? '' : 's'})` : ''
  output.blank()
  console.log(output.dim(`${all.length} plugin${all.length === 1 ? '' : 's'} · ${formatSize(totalSize)}${excludes}`))
}
