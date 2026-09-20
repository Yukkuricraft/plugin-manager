import fs from 'fs/promises'

import { UserError } from '../errors.js'
import { loadPlugins } from '../pluginList.js'
import { allPluginSources, type PluginSource } from '../sources/pluginSource.js'
import { assertNoSubstitutedPluginsLocked } from '../substitute.js'
import { output } from '../utils/output.js'

const managedDir = './managedPlugins'
const pluginsDir = './plugins'

/** Where a source stages its downloads. Each source has its own directory, so no source can delete another's files */
function stagingDir(source: PluginSource) {
  return `${managedDir}/${source.prefix}`
}

/**
 * Throws if two sources staged a file with the same name, since one would overwrite the other in the plugins folder.
 * add refuses a filename another plugin already uses, so this catches a plugins.json edited by hand.
 */
async function assertNoSharedFilenames() {
  const stagedBy = new Map<string, string>()
  const problems: string[] = []
  for (const source of allPluginSources) {
    for (const file of await fs.readdir(stagingDir(source))) {
      const other = stagedBy.get(file)
      if (other) problems.push(`${file} is downloaded by both ${other} and ${source.prefix}`)
      else stagedBy.set(file, source.prefix)
    }
  }
  if (problems.length > 0) throw new UserError(`Refusing to install:\n${problems.join('\n')}`)
}

export default async function installPlugins(pluginsPath: string) {
  const plugins = await loadPlugins(pluginsPath)
  // Before any folder is touched, so a refused install leaves the server's current plugins in place
  assertNoSubstitutedPluginsLocked(plugins)
  output.download('Downloading plugins...')

  await fs.mkdir(managedDir, { recursive: true })

  // managedPlugins holds nothing but the sources' directories. Anything else, such as the JARs saved there before each
  // source had its own directory, is removed
  const prefixes = new Set<string>(allPluginSources.map((source) => source.prefix))
  for (const entry of await fs.readdir(managedDir)) {
    if (!prefixes.has(entry)) await fs.rm(`${managedDir}/${entry}`, { recursive: true, force: true })
  }

  for (const source of allPluginSources) {
    await fs.mkdir(stagingDir(source), { recursive: true })
    await source.install(plugins.all, stagingDir(source))
  }
  await assertNoSharedFilenames()

  output.blank()
  output.info('Reconstructing plugins folder')

  // Only once every download succeeded, so a failed install leaves the server's current plugins in place
  await fs.rm(pluginsDir, { recursive: true, force: true })
  for (const source of allPluginSources) {
    await fs.cp(stagingDir(source), pluginsDir, { recursive: true, force: true })
  }

  output.blank()
  output.success('Installation complete!')
}
