import { type AllPlugins, type Plugin as BasePlugin, Plugins } from '../pluginList.js'
import { type Loader } from './modrinth/loaders.js'
import modrinthSource from './modrinth/modrinthSource.js'
import urlSource from './url/urlSource.js'

export interface PluginSource<Plugin extends BasePlugin = BasePlugin> {
  readonly prefix: 'modrinth' | 'url'

  search(query: string, loader: Loader, gameVersion?: string): Promise<void>
  findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: Plugin; id: string } | null>
  viewPlugins(plugins: { plugin: Plugin; id: string }[], last: boolean): Promise<void>
  removePlugin(plugins: Plugins, allToRemove: { plugin: BasePlugin; id: string }[]): void
  install(plugins: AllPlugins): Promise<void>
  update(
    existingPlugins: Plugins,
    newPlugins: Plugins,
    loader: Loader,
    gameVersion?: string,
    featured?: boolean,
  ): Promise<{
    changelog: string
    removed: string[]
    added: string[]
    changed: { identifier: string; oldVersion: string; newVersion: string }[]
  }>
  /** Resolves to whether `plugins` was changed */
  addPlugin(
    plugins: Plugins,
    pluginIndicator: string,
    loader: Loader,
    gameVersion?: string,
    featured?: boolean,
  ): Promise<boolean>
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
