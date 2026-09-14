export type ColumnWidths = { name: number; version: number; size: number }

/**
 * A plugin as listed by the `show` command. Each source implements this, since what's known about a plugin (and so
 * what's shown) differs between sources
 */
export interface PluginEntry {
  /** Display name, also used for sorting */
  readonly name: string
  /** Whether the plugin was added directly, as opposed to being pulled in as a dependency */
  readonly added: boolean
  /** File size in bytes, or null if not known */
  readonly size: number | null

  /** Widths this entry needs in the compact listing, so columns can be aligned across all entries */
  columnWidths(): ColumnWidths
  printCompact(widths: ColumnWidths): void
  printVerbose(): void
}
