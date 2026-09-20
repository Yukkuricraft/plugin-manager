import { loadPlugins } from '../pluginList.js'
import { type ColumnWidths, type PluginEntry } from '../sources/pluginEntry.js'
import { allPluginSources } from '../sources/pluginSource.js'
import { formatSize, output } from '../utils/output.js'

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export default async function showPlugins(pluginsPath: string, verbose: boolean) {
  const pluginsObj = await loadPlugins(pluginsPath)
  const { loader, gameVersion } = pluginsObj.config
  console.log(`${output.label('Server')} ${output.highlight(`${loader} ${gameVersion}`)}`)
  for (const rule of Object.values(pluginsObj.config.substitutes ?? {})) {
    console.log(`${output.label('Substitute')} ${output.highlight(`${rule.slug} → ${rule.substituteSlug}`)}`)
  }
  output.blank()
  const all = allPluginSources
    .flatMap((source) => source.listEntries(pluginsObj))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (all.length === 0) {
    output.info('No plugins in plugins.json')
    return
  }

  const widths = all
    .map((entry) => entry.columnWidths())
    .reduce(
      (max, w): ColumnWidths => ({
        name: Math.max(max.name, w.name),
        version: Math.max(max.version, w.version),
        size: Math.max(max.size, w.size),
      }),
    )

  const sections: [string, PluginEntry[]][] = [
    ['Added', all.filter((entry) => entry.added)],
    ['Dependencies', all.filter((entry) => !entry.added)],
  ]
  sections
    .filter(([, entries]) => entries.length > 0)
    .forEach(([title, entries], i) => {
      if (i > 0) output.blank()

      output.header(`${title} (${entries.length})`)
      for (const entry of entries) {
        if (verbose) entry.printVerbose()
        else entry.printCompact(widths)
      }
    })

  const sizes = all.flatMap((entry) => (entry.size === null ? [] : [entry.size]))
  const totalSize = sizes.reduce((sum, size) => sum + size, 0)
  const unknownCount = all.length - sizes.length
  const excludes = unknownCount > 0 ? ` (excludes ${plural(unknownCount, 'plugin')} of unknown size)` : ''
  output.blank()
  console.log(output.dim(`${plural(all.length, 'plugin')} · ${formatSize(totalSize)}${excludes}`))
}
