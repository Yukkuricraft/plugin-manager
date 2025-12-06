import { type AllPlugins, type Plugin as BasePlugin, Plugins } from '../pluginList.js'
import modrinthSource from './modrinth/modrinthSource.js'

export interface PluginSource<Plugin extends BasePlugin = BasePlugin> {
  readonly prefix: 'modrinth' | 'url'

  search(query: string): Promise<void>
  findPlugin(query: string, plugins: AllPlugins): { plugin: Plugin; id: string } | null
  viewPlugins(plugins: { plugin: Plugin; id: string }[], last: boolean): Promise<void>
  removePlugin(plugins: Plugins, allToRemove: { plugin: BasePlugin; id: string }[]): void
  install(plugins: AllPlugins): Promise<void>
  update(
    existingPlugins: Plugins,
    newPlugins: Plugins,
    gameVersion?: string,
    featured?: boolean,
  ): Promise<{
    changelog: string
    removed: string[]
    added: string[]
    changed: { identifier: string; oldVersion: string; newVersion: string }[]
  }>
  addPlugin(plugins: Plugins, pluginIndicator: string, gameVersion?: string, featured?: boolean): Promise<void>
}

export const allPluginSources: PluginSource[] = [modrinthSource]

export function getPluginSource(query: string): { source: PluginSource; strippedQuery: string } {
  const source = allPluginSources.find((s) => query.startsWith(s.prefix + ':'))
  if (source) {
    return { source, strippedQuery: query.substring(source.prefix.length) }
  } else {
    return { source: modrinthSource, strippedQuery: query }
  }
}
