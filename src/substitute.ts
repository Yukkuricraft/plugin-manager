import { dependantNames, isAddedModrinthPlugin, type Plugins, type SubstituteRule } from './pluginList.js'
import { findProject } from './sources/modrinth/utils.js'
import { UserError } from './errors.js'

/**
 * Records that the project `substituteQuery` names satisfies every required dependency on the project `pluginQuery`
 * names, and returns the rule. Both are Modrinth slugs or IDs.
 *
 * Refuses when either project is already part of a substitution, so rules never chain. Also refuses when the project
 * being replaced is already in the lockfile, since it and its substitute would both be installed.
 */
export async function declareSubstitute(
  plugins: Plugins,
  pluginQuery: string,
  substituteQuery: string,
): Promise<SubstituteRule> {
  const plugin = await findProject(pluginQuery)
  const substitute = await findProject(substituteQuery)
  if (plugin.id === substitute.id) throw new UserError(`${plugin.slug} can't substitute for itself`)

  const rules = plugins.config.substitutes ?? {}
  for (const project of [plugin, substitute]) {
    const existing = Object.entries(rules).find(([id, rule]) => id === project.id || rule.substitute === project.id)
    if (existing) {
      const [, rule] = existing
      throw new UserError(
        `${project.slug} is already in the substitution ${rule.slug} → ${rule.substituteSlug}. Run \`yarn run-cli substitute --remove ${rule.slug}\` first`,
      )
    }
  }

  const locked = plugins.all.modrinth[plugin.id]
  if (locked) {
    const dependants = dependantNames(plugins.all.modrinth, locked)
    if (isAddedModrinthPlugin(plugins, locked) || dependants.length === 0) {
      throw new UserError(
        `${plugin.slug} is in plugins.json. Run \`yarn run-cli remove ${plugin.slug}\` first, then declare the substitution`,
      )
    }
    const names = dependants.join(', ')
    throw new UserError(
      `${plugin.slug} is locked as a dependency of ${names}. Remove ${names}, declare the substitution, then add them back so they pick up ${substitute.slug}`,
    )
  }

  const rule: SubstituteRule = {
    slug: plugin.slug,
    substitute: substitute.id,
    substituteSlug: substitute.slug,
    substituteSource: 'modrinth',
  }
  plugins.config.substitutes = { ...rules, [plugin.id]: rule }
  return rule
}

/**
 * Deletes the rule replacing the project `pluginQuery` names, and returns it. The project is matched by ID or by the
 * slug recorded in the rule, so no request is made. The lockfile is left alone: plugins resolved to the substitute
 * keep it until they're next added or updated.
 */
export function removeSubstitute(plugins: Plugins, pluginQuery: string): SubstituteRule {
  const rules = plugins.config.substitutes ?? {}
  const found = Object.entries(rules).find(([id, rule]) => id === pluginQuery || rule.slug === pluginQuery)
  if (!found) throw new UserError(`No substitution for ${pluginQuery} in plugins.json`)

  const [id, rule] = found
  delete rules[id]
  plugins.config.substitutes = Object.keys(rules).length > 0 ? rules : undefined
  return rule
}

/**
 * Throws if the lockfile contains a project that a substitute rule replaces, since both it and its substitute would
 * then be installed. The commands never lock such a project, so this catches a plugins.json edited by hand, or a path
 * the commands missed. install runs it before touching the plugins folder.
 */
export function assertNoSubstitutedPluginsLocked(plugins: Plugins) {
  const problems = Object.entries(plugins.config.substitutes ?? {}).flatMap(([id, rule]) => {
    const entry = plugins.all.modrinth[id]
    if (!entry) return []

    const dependants = dependantNames(plugins.all.modrinth, entry)
    if (isAddedModrinthPlugin(plugins, entry) || dependants.length === 0) {
      return [
        `${rule.slug} is in plugins.json, but it's substituted by ${rule.substituteSlug}. Run \`yarn run-cli remove ${rule.slug}\``,
      ]
    }
    const names = dependants.join(', ')
    return [
      `${rule.slug} is in plugins.json as a dependency of ${names}, but it's substituted by ${rule.substituteSlug}. ` +
        `Remove and re-add ${names} to pick up ${rule.substituteSlug}, or run \`yarn run-cli substitute --remove ${rule.slug}\``,
    ]
  })
  if (problems.length > 0) throw new UserError(`Refusing to install:\n${problems.join('\n')}`)
}
