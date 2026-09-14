import { type ModrinthPlugin } from '../../pluginList.js'
import { formatDate, formatSize, output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'

export default class ModrinthPluginEntry implements PluginEntry {
  constructor(
    readonly name: string,
    readonly added: boolean,
    readonly plugin: ModrinthPlugin,
    /** Names of the plugins that depend on this one */
    readonly requiredBy: string[],
  ) {}

  get size() {
    return this.plugin.size
  }

  /** A dependency that nothing depends on anymore */
  get orphaned() {
    return !this.added && this.requiredBy.length === 0
  }

  columnWidths(): ColumnWidths {
    return {
      name: this.name.length,
      version: this.plugin.version.length,
      size: formatSize(this.plugin.size).length,
    }
  }

  printCompact(widths: ColumnWidths) {
    const { version, size, publishedAt } = this.plugin
    console.log(
      `  ${output.pluginName(`${symbols.plugin} ${this.name.padEnd(widths.name)}`)}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(publishedAt))}${this.note()}`,
    )
  }

  printVerbose() {
    output.pluginCard({
      title: this.orphaned ? `${this.name} ${output.dim('(orphaned)')}` : this.name,
      version: this.plugin.version,
      filename: this.plugin.filename,
      size: this.plugin.size,
      publishedAt: this.plugin.publishedAt,
      requiredBy: this.requiredBy,
    })
  }

  private note() {
    if (this.orphaned) return ` ${output.dim('(orphaned)')}`
    if (this.requiredBy.length > 0) return ` ${output.dim(`← required by ${this.requiredBy.join(', ')}`)}`
    return ''
  }
}
