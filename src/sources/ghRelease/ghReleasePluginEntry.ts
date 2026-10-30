import chalk from 'chalk'

import { type GhReleasePlugin } from '../../pluginList.js'
import { formatDate, formatSize, output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'

export default class GhReleasePluginEntry implements PluginEntry {
  // gh-release plugins can't be dependencies, so they're always added directly
  readonly added = true
  readonly name: string
  readonly plugin: GhReleasePlugin
  /** Slugs of the projects this plugin is used in place of, per substitute rules in plugins.json */
  readonly substitutes?: string

  constructor(name: string, plugin: GhReleasePlugin, substitutes?: string) {
    this.name = name
    this.plugin = plugin
    this.substitutes = substitutes
  }

  get size() {
    return this.plugin.size
  }

  /** The name column also holds a "(gh-release)" suffix */
  get #nameWidth() {
    return `${this.name} (gh-release)`.length
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
      `  ${output.pluginName(`${symbols.plugin} ${this.name}`)} ${output.dim('(gh-release)')}${padding}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(pinnedAt))}  ${output.dim(filename)}${tag}`,
    )
  }

  printVerbose() {
    output.pluginCard({
      title: this.name,
      version: this.plugin.version,
      tag: this.plugin.tag,
      substitutes: this.substitutes,
      filename: this.plugin.filename,
      size: this.plugin.size,
      sha512: this.plugin.sha512,
      publishedAt: this.plugin.publishedAt,
      pinnedAt: this.plugin.pinnedAt,
      url: this.plugin.url,
    })
  }
}
