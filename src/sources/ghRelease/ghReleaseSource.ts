/* eslint-disable @typescript-eslint/require-await */
import type { PluginSource } from '../pluginSource.js'
import { UserError, ValidationError } from '../../errors.js'
import { AllPlugins, GhReleasePlugin, Plugin, Plugins } from '../../pluginList.js'
import { listReleases } from '../../utils/github.js'
import { formatSize, output } from '../../utils/output.js'
import { substitutedSlugs } from '../../substitute.js'
import { installPinned } from '../url/install.js'
import GhReleasePluginEntry from './ghReleasePluginEntry.js'
import { pickAsset, pickRelease } from './pick.js'
import { pinRelease } from './pin.js'
import { releasesFor, requireReleaseRepo } from './releases.js'

// `satisfies` (rather than a `: PluginSource<GhReleasePlugin>` annotation) keeps `listEntries`'s inferred
// `GhReleasePluginEntry[]` return type, so callers can read `.substitutes` off the result.
const ghReleaseSource = {
  prefix: 'gh-release',
  async findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: GhReleasePlugin; id: string } | null> {
    const plugin = plugins['gh-release'][query]
    return plugin ? { plugin, id: query } : null
  },
  search(): Promise<void> {
    throw new UserError('Search is not possible for gh-release plugins')
  },
  async viewPlugins(plugins: { plugin: GhReleasePlugin; id: string }[]): Promise<void> {
    for (const { plugin, id } of plugins) {
      new GhReleasePluginEntry(id, plugin).printVerbose()
    }
  },
  listEntries(plugins: Plugins): GhReleasePluginEntry[] {
    const replaced = substitutedSlugs(plugins, 'gh-release')
    return Object.entries(plugins.all['gh-release']).map(
      ([id, plugin]) => new GhReleasePluginEntry(id, plugin, replaced.get(id)),
    )
  },
  async addPlugin(plugins: Plugins, id: string): Promise<boolean> {
    if (id.includes('/') || id.includes('@')) {
      throw new ValidationError(`Invalid gh-release plugin id "${id}": it can't contain "/" or "@"`)
    }
    const repo = requireReleaseRepo(plugins.config)
    const existing = plugins.all['gh-release'][id]

    const releases = releasesFor(await listReleases(repo), id)
    const release = await pickRelease(id, releases, existing?.tag)
    if (release.tag_name === existing?.tag) {
      output.info(`Plugin ${output.pluginName(id)} is already pinned to ${release.tag_name}. Exiting early`)
      return false
    }

    const asset = await pickAsset(release)
    const entry = await pinRelease(plugins, id, release, asset)
    plugins.added[`gh-release:${id}`] = entry.version
    plugins.all['gh-release'][id] = entry
    output.info(
      `${output.pluginName(id)} ${output.version(entry.version)}: ${entry.filename} (${formatSize(entry.size)}, sha512 ${entry.sha512.slice(0, 8)})`,
    )
    return true
  },
  install(plugins: AllPlugins, dir: string): Promise<void> {
    return installPinned(plugins['gh-release'], dir, (id) => `publish a new release and run update gh-release ${id}`)
  },
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all['gh-release'][id]
    }
  },
} satisfies PluginSource<GhReleasePlugin>

export default ghReleaseSource
