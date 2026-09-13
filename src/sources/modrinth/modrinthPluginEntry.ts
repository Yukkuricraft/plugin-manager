import chalk from 'chalk'

import { type ModrinthPlugin } from '../../pluginList.js'
import { formatDate, formatOverrides, formatSize, output, symbols } from '../../utils/output.js'
import { type ColumnWidths, type PluginEntry } from '../pluginEntry.js'

export default class ModrinthPluginEntry implements PluginEntry {
  readonly name: string
  readonly added: boolean
  readonly plugin: ModrinthPlugin
  /** Names of the plugins that depend on this one */
  readonly requiredBy: string[]

  constructor(name: string, added: boolean, plugin: ModrinthPlugin, requiredBy: string[]) {
    this.name = name
    this.added = added
    this.plugin = plugin
    this.requiredBy = requiredBy
  }

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
      `  ${output.pluginName(`${symbols.plugin} ${this.name.padEnd(widths.name)}`)}  ${output.version(version.padEnd(widths.version))}  ${output.dim(formatSize(size).padStart(widths.size))}  ${output.dim(formatDate(publishedAt))}${this.#note()}`,
    )
  }

  printVerbose() {
    output.pluginCard({
      title: this.orphaned ? `${this.name} ${output.dim('(orphaned)')}` : this.name,
      version: this.plugin.version,
      overrides: this.plugin.overrides,
      filename: this.plugin.filename,
      size: this.plugin.size,
      publishedAt: this.plugin.publishedAt,
      requiredBy: this.requiredBy,
    })
  }

  #note() {
    const overrides = formatOverrides(this.plugin.overrides)
    const override = overrides ? ` ${chalk.yellowBright(`[override: ${overrides}]`)}` : ''
    if (this.orphaned) return `${override} ${output.dim('(orphaned)')}`
    if (this.requiredBy.length > 0) return `${override} ${output.dim(`← required by ${this.requiredBy.join(', ')}`)}`
    return override
  }
}
