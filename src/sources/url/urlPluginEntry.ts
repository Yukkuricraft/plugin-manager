import { type UrlPlugin } from '../../pluginList.js'
import { formatDate, formatSize, output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'
import { installedPath } from './pin.js'

export default class UrlPluginEntry implements PluginEntry {
  // URL plugins can't be dependencies, so they're always added directly
  readonly added = true
  readonly name: string
  readonly plugin: UrlPlugin

  constructor(name: string, plugin: UrlPlugin) {
    this.name = name
    this.plugin = plugin
  }

  get size() {
    return this.plugin.size
  }

  /** The name column also holds a "(url)" suffix */
  get #nameWidth() {
    return `${this.name} (url)`.length
  }

  /** Where this plugin's file lands, relative to the plugins folder */
  get #installedPath() {
    return installedPath(this.plugin.filename, this.plugin.overrides?.path)
  }

  columnWidths(): ColumnWidths {
    return {
      name: this.#nameWidth,
      version: this.plugin.version.length,
      size: formatSize(this.plugin.size).length,
    }
  }

  printCompact(widths: ColumnWidths) {
    const { version, size, pinnedAt } = this.plugin
    const padding = ' '.repeat(widths.name - this.#nameWidth)
    console.log(
      `  ${output.pluginName(`${symbols.plugin} ${this.name}`)} ${output.dim('(url)')}${padding}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(pinnedAt))}  ${output.dim(this.#installedPath)}`,
    )
  }

  printVerbose() {
    output.pluginCard({
      title: this.name,
      version: this.plugin.version,
      installPath: this.plugin.overrides?.path,
      filename: this.plugin.filename,
      size: this.plugin.size,
      sha512: this.plugin.sha512,
      pinnedAt: this.plugin.pinnedAt,
      url: this.plugin.url,
    })
  }
}
