import chalk from 'chalk'

import { type UrlPlugin } from '../../pluginList.js'
import { formatDate, formatSize, output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'

export default class UrlPluginEntry implements PluginEntry {
  // URL plugins can't be dependencies, so they're always added directly
  readonly added = true
  readonly name: string
  readonly plugin: UrlPlugin
  /** Slug of the project this plugin is used in place of, per a substitute rule in plugins.json */
  readonly substitutes?: string

  constructor(name: string, plugin: UrlPlugin, substitutes?: string) {
    this.name = name
    this.plugin = plugin
    this.substitutes = substitutes
  }

  get size() {
    return this.plugin.size
  }

  /** The name column also holds a "(url)" suffix */
  get #nameWidth() {
    return `${this.name} (url)`.length
  }

  columnWidths(): ColumnWidths {
    return {
      name: this.#nameWidth,
      version: this.plugin.version.length,
      size: formatSize(this.plugin.size).length,
    }
  }

  printCompact(widths: ColumnWidths) {
    const { version, size, pinnedAt, filename } = this.plugin
    const padding = ' '.repeat(widths.name - this.#nameWidth)
    const tag = this.substitutes ? ` ${chalk.cyanBright(`[substitutes ${this.substitutes}]`)}` : ''
    console.log(
      `  ${output.pluginName(`${symbols.plugin} ${this.name}`)} ${output.dim('(url)')}${padding}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(pinnedAt))}  ${output.dim(filename)}${tag}`,
    )
  }

  printVerbose() {
    output.pluginCard({
      title: this.name,
      version: this.plugin.version,
      substitutes: this.substitutes,
      filename: this.plugin.filename,
      size: this.plugin.size,
      sha512: this.plugin.sha512,
      pinnedAt: this.plugin.pinnedAt,
      url: this.plugin.url,
    })
  }
}
