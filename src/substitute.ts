import { dependantNames, isAddedModrinthPlugin, type Plugins, type SubstituteRule } from './pluginList.js'
import { getPluginSource } from './sources/pluginSource.js'
import { findProject } from './sources/modrinth/utils.js'
import { UserError } from './errors.js'

/** The substitute side of a rule, resolved from a query that may carry a `url:` prefix */
async function findSubstitute(
  plugins: Plugins,
  query: string,
): Promise<{ id: string; slug: string; source: 'modrinth' | 'url' }> {
  const { source, strippedQuery } = getPluginSource(query)
  if (source.prefix === 'url') {
    if (!plugins.all.url[strippedQuery]) {
      throw new UserError(
        `No url plugin ${strippedQuery} in plugins.json. Run \`yarn run-cli add url:${strippedQuery}@<version>@<url>\` first`,
      )
    }
    // A url plugin's key is both its ID and the name it's shown under
    return { id: strippedQuery, slug: strippedQuery, source: 'url' }
  }

  const project = await findProject(strippedQuery)
  return { ...project, source: 'modrinth' }
}

/**
 * Records that the project or url plugin `substituteQuery` names satisfies every required dependency on the Modrinth
 * project `pluginQuery` names, and returns the rule. `pluginQuery` is a Modrinth slug or ID; `substituteQuery` is a
 * Modrinth slug or ID, or a `url:`-prefixed url plugin key.
 *
 * Refuses when either side is already part of a substitution, so rules never chain. Also refuses when the project
 * being replaced is already in the lockfile, since it and its substitute would both be installed.
 */
export async function declareSubstitute(
  plugins: Plugins,
  pluginQuery: string,
  substituteQuery: string,
): Promise<SubstituteRule> {
  const plugin = await findProject(pluginQuery)
  const substitute = await findSubstitute(plugins, substituteQuery)
  if (substitute.source === 'modrinth' && plugin.id === substitute.id) {
    throw new UserError(`${plugin.slug} can't substitute for itself`)
  }

  const rules = plugins.config.substitutes ?? {}
  const parties: { id: string; slug: string; source: 'modrinth' | 'url' }[] = [
    { ...plugin, source: 'modrinth' },
    substitute,
  ]
  for (const party of parties) {
    const existing = Object.entries(rules).find(
      ([id, rule]) =>
        (party.source === 'modrinth' && id === party.id) ||
        (rule.substituteSource === party.source && rule.substitute === party.id),
    )
    if (existing) {
      const [, rule] = existing
      throw new UserError(
        `${party.slug} is already in the substitution ${rule.slug} → ${rule.substituteSlug}. Run \`yarn run-cli substitute --remove ${rule.slug}\` first`,
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
    substituteSource: substitute.source,
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
