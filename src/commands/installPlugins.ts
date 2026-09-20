import fs from 'fs/promises'

import { UserError } from '../errors.js'
import { assertNoSubstitutedPluginsLocked, loadPlugins } from '../pluginList.js'
import { allPluginSources, type PluginSource } from '../sources/pluginSource.js'
import { listFiles } from '../utils/files.js'
import { output } from '../utils/output.js'

const managedDir = './managedPlugins'
const pluginsDir = './plugins'

/** Where a source stages its downloads. Each source has its own directory, so no source can delete another's files */
function stagingDir(source: PluginSource) {
  return `${managedDir}/${source.prefix}`
}

/**
 * Throws if two sources staged a file at the same path, since one would overwrite the other in the plugins folder,
 * or if one staged a file at a path another staged a directory under - e.g. X.jar staged as a file by one source and
 * X.jar/e.jar staged by another - since fs.cp would fail on that clash after ./plugins is already being rebuilt. add
 * refuses both pairings, so this catches only a plugins.json edited by hand.
 */
async function assertNoSharedPaths() {
  const staged: { file: string; source: string }[] = []
  for (const source of allPluginSources) {
    for (const file of await listFiles(stagingDir(source))) staged.push({ file, source: source.prefix })
  }

  const problems: string[] = []

  const stagedBy = new Map<string, string>()
  for (const { file, source } of staged) {
    const other = stagedBy.get(file)
    if (other) problems.push(`${file} is downloaded by both ${other} and ${source}`)
    else stagedBy.set(file, source)
  }

  for (const { file: dirCandidate, source: dirSource } of staged) {
    for (const { file: nested, source: nestedSource } of staged) {
      if (dirSource === nestedSource) continue
      if (nested.startsWith(`${dirCandidate}/`)) {
        problems.push(
          `${dirCandidate}, staged as a file by ${dirSource}, clashes with ${nested}, staged by ${nestedSource} inside a directory of that name`,
        )
      }
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
  await assertNoSharedPaths()

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
