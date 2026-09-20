/* eslint-disable @typescript-eslint/require-await */
import { type AddFlags, type PluginSource } from '../pluginSource.js'
import {
  AllPlugins,
  normalizeInstallPath,
  Plugin,
  Plugins,
  type UrlPluginOverrides,
  UrlPlugin,
} from '../../pluginList.js'
import { formatSize, output } from '../../utils/output.js'
import { UserError } from '../../errors.js'
import install from './install.js'
import { installedPath, parseUrlQuery, pinUrl } from './pin.js'
import update from './update.js'
import UrlPluginEntry from './urlPluginEntry.js'

/**
 * The overrides to store for a url entry. An omitted --path keeps what's already stored, so re-adding an entry to
 * correct its URL leaves the file where it is. An empty one drops the overrides, moving it back to the plugins root.
 */
function resolveOverrides(existing: UrlPlugin | undefined, flag: string | undefined): UrlPluginOverrides | undefined {
  if (flag === undefined) return existing?.overrides
  if (flag.trim() === '') return undefined
  return { path: normalizeInstallPath(flag) }
}

const urlSource: PluginSource<UrlPlugin> = {
  prefix: 'url',
  async findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: UrlPlugin; id: string } | null> {
    const plugin = plugins.url[query]
    return plugin ? { plugin, id: query } : null
  },
  search(): Promise<void> {
    throw new UserError('Search is not possible for URLs')
  },
  async viewPlugins(plugins: { plugin: UrlPlugin; id: string }[]): Promise<void> {
    for (const { plugin, id } of plugins) {
      new UrlPluginEntry(id, plugin).printVerbose()
    }
  },
  listEntries(plugins: Plugins): UrlPluginEntry[] {
    return Object.entries(plugins.all.url).map(([id, plugin]) => new UrlPluginEntry(id, plugin))
  },
  async addPlugin(plugins: Plugins, pluginIndicator: string, flags: AddFlags): Promise<boolean> {
    const { id, version, url } = parseUrlQuery(pluginIndicator)

    const existing = plugins.all.url[id]
    const overrides = resolveOverrides(existing, flags.path)
    if (existing?.url === url && existing.version === version && existing.overrides?.path === overrides?.path) {
      output.info(`Plugin ${output.pluginName(id)} is already added with this URL, version and path. Exiting early`)
      return false
    }

    const pin = await pinUrl(plugins, id, url, overrides?.path)
    plugins.added[`url:${id}`] = version
    plugins.all.url[id] = {
      source: 'url',
      url,
      version,
      ...pin,
      pinnedAt: new Date().toISOString(),
      ...(overrides && { overrides }),
    }
    output.info(
      `${output.pluginName(id)} ${output.version(version)}: ${installedPath(pin.filename, overrides?.path)} (${formatSize(pin.size)}, sha512 ${pin.sha512.slice(0, 8)})`,
    )
    return true
  },
  update,
  install,
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all.url[id]
    }
  },
}

export default urlSource
