import { loadPlugins, writePlugins } from '../pluginList.js'
import { declareSubstitute, removeSubstitute } from '../substitute.js'
import { UserError } from '../errors.js'
import { output } from '../utils/output.js'

/**
 * Declares that `substitute` satisfies every dependency on `plugin`, or with `remove`, deletes that declaration. Only
 * the configuration changes, so nothing is confirmed or installed.
 */
export default async function substitutePlugins(
  pluginsPath: string,
  plugin: string,
  substitute: string | undefined,
  flags: { remove?: boolean },
) {
  const plugins = await loadPlugins(pluginsPath)

  if (flags.remove) {
    if (substitute !== undefined) throw new UserError('--remove only takes the plugin whose substitution to remove')
    const rule = removeSubstitute(plugins, plugin)
    await writePlugins(plugins, pluginsPath)
    output.success(`Removed the substitution ${rule.slug} → ${rule.substituteSlug}`)
    const substituteStillPresent =
      rule.substituteSource === 'url' ? plugins.all.url[rule.substitute] : plugins.all.modrinth[rule.substitute]
    if (substituteStillPresent) {
      output.info(
        `Plugins using ${rule.substituteSlug} in place of ${rule.slug} keep it until they're next added or updated`,
      )
    }
    return
  }

  if (substitute === undefined) throw new UserError('Name the plugin to substitute it with, or pass --remove')
  const rule = await declareSubstitute(plugins, plugin, substitute)
  await writePlugins(plugins, pluginsPath)
  output.success(`${rule.substituteSlug} now substitutes for ${rule.slug}`)
}
