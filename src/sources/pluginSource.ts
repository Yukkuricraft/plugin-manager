import { type AllPlugins, type Plugin as BasePlugin, Plugins } from '../pluginList.js'
import { type ResolutionFlags } from '../resolution.js'
import { type Loader } from './modrinth/loaders.js'
import modrinthSource from './modrinth/modrinthSource.js'
import { type PluginEntry } from './pluginEntry.js'
import urlSource from './url/urlSource.js'

/** The command-line flags `add` passes through to a plugin source when resolving each plugin it's given */
export interface AddFlags extends ResolutionFlags {
  featured?: boolean
}

/** The Minecraft version (and optional featured-only filter) that `update` resolves plugins.json against */
export interface UpdateTarget {
  gameVersion: string
  featured?: boolean
}

/**
 * One plugin's Minecraft version override changing during `update`: either granted, because the plugin
 * couldn't reach the target and is being held at its current build, or cleared, because a plugin that was
 * previously held back has now caught up with the target.
 */
export interface OverrideChange {
  identifier: string
  change: 'granted' | 'cleared'
  gameVersion: string
}

export interface PluginSource<Plugin extends BasePlugin = BasePlugin> {
  readonly prefix: 'modrinth' | 'url'

  search(query: string, loader: Loader, gameVersion?: string): Promise<void>
  findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: Plugin; id: string } | null>
  viewPlugins(plugins: { plugin: Plugin; id: string }[], last: boolean): Promise<void>
  /** This source's plugins in `plugins`, for listing */
  listEntries(plugins: Plugins): PluginEntry[]
  removePlugin(plugins: Plugins, allToRemove: { plugin: BasePlugin; id: string }[]): void
  install(plugins: AllPlugins): Promise<void>
  update(
    existingPlugins: Plugins,
    newPlugins: Plugins,
    target: UpdateTarget,
  ): Promise<{
    changelog: string
    removed: string[]
    added: string[]
    changed: { identifier: string; oldVersion: string; newVersion: string }[]
    overrides: OverrideChange[]
  }>
  /** Resolves to whether `plugins` was changed */
  addPlugin(plugins: Plugins, pluginIndicator: string, flags: AddFlags): Promise<boolean>
}

export const allPluginSources: PluginSource[] = [modrinthSource, urlSource]

export function getPluginSource(query: string): { source: PluginSource; strippedQuery: string } {
  const source = allPluginSources.find((s) => query.startsWith(s.prefix + ':'))
  if (source) {
    return { source, strippedQuery: query.substring(source.prefix.length + 1) }
  } else {
    return { source: modrinthSource, strippedQuery: query }
  }
}
