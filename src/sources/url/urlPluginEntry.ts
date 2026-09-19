import { output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'

export default class UrlPluginEntry implements PluginEntry {
  // URL plugins can't be dependencies, so they're always added directly
  readonly added = true
  readonly size = null
  readonly name: string
  readonly url: string

  constructor(name: string, url: string) {
    this.name = name
    this.url = url
  }

  /** The name column also holds a "(url)" suffix */
  get #nameWidth() {
    return `${this.name} (url)`.length
  }

  columnWidths(): ColumnWidths {
    return { name: this.#nameWidth, version: 0, size: 0 }
  }

  printCompact(widths: ColumnWidths) {
    const padding = ' '.repeat(widths.name - this.#nameWidth)
    console.log(
      `  ${output.pluginName(`${symbols.plugin} ${this.name}`)} ${output.dim('(url)')}${padding}  ${output.url(this.url)}`,
    )
  }

  printVerbose() {
    output.pluginCard({ title: this.name, url: this.url })
  }
}
