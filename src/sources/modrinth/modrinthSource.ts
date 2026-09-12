import * as prompts from '@inquirer/prompts'

import { AllPlugins, ModrinthPlugin } from '../../pluginList.js'
import { type PluginSource } from '../pluginSource.js'
import addPlugin from './addPlugin.js'
import install from './install.js'
import removePlugin from './removePlugin.js'
import search from './search.js'
import update from './update.js'
import viewPlugins from './viewPlugins.js'

const modrinthSource: PluginSource<ModrinthPlugin> = {
  prefix: 'modrinth' as const,
  async findPlugin(query: string, plugins: AllPlugins): Promise<{ plugin: ModrinthPlugin; id: string } | null> {
    const lowerQuery = query.toLowerCase()
    const matches = Object.entries(plugins.modrinth).flatMap(([id, plugin]) =>
      plugin.slug?.toLowerCase().includes(lowerQuery)
        ? [{ plugin, id, slug: plugin.slug, exact: plugin.slug.toLowerCase() === lowerQuery }]
        : [],
    )

    if (matches.length <= 1) return matches[0] ?? null

    // Ask even when one slug matches exactly, since e.g. worldedit is also a substring of fastasyncworldedit. The exact
    // match is listed first so it's the default
    matches.sort((a, b) => Number(b.exact) - Number(a.exact) || a.slug.localeCompare(b.slug))
    const { plugin, id } = await prompts.select({
      message: `"${query}" matches multiple plugins`,
      choices: matches.map((m) => ({ name: m.exact ? `${m.slug} (exact)` : m.slug, value: m })),
    })
    return { plugin, id }
  },
  search,
  viewPlugins,
  addPlugin,
  update,
  install,
  removePlugin,
}

export default modrinthSource
