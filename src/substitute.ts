import { dependantNames, isAddedModrinthPlugin, type Plugin, type Plugins, type SubstituteRule } from './pluginList.js'
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
    const urlPlugin = plugins.all.url[strippedQuery]
    if (!urlPlugin) {
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

  // Only Modrinth projects are held to one rule each, which is what stops a rule chaining into another. A url
  // plugin stands in for as many projects as the user declares, since rules are keyed by Modrinth project ID and
  // nothing can replace a url plugin in turn.
  const rules = plugins.config.substitutes ?? {}
  const parties = [plugin, ...(substitute.source === 'modrinth' ? [substitute] : [])]
  for (const party of parties) {
    const existing = Object.entries(rules).find(
      ([id, rule]) => id === party.id || (rule.substituteSource === 'modrinth' && rule.substitute === party.id),
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
 * then be installed, or if a rule's url substitute is missing from plugins.json, which would leave every dependency
 * on the replaced project unsatisfied. The commands never produce either state, so this catches a plugins.json edited
 * by hand, or a path the commands missed. install runs it before touching the plugins folder.
 */
export function assertNoSubstitutedPluginsLocked(plugins: Plugins) {
  const problems = Object.entries(plugins.config.substitutes ?? {}).flatMap(([id, rule]) => {
    const ruleProblems: string[] = []

    const entry = plugins.all.modrinth[id]
    if (entry) {
      const dependants = dependantNames(plugins.all.modrinth, entry)
      if (isAddedModrinthPlugin(plugins, entry) || dependants.length === 0) {
        ruleProblems.push(
          `${rule.slug} is in plugins.json, but it's substituted by ${rule.substituteSlug}. Run \`yarn run-cli remove ${rule.slug}\``,
        )
      } else {
        const names = dependants.join(', ')
        ruleProblems.push(
          `${rule.slug} is in plugins.json as a dependency of ${names}, but it's substituted by ${rule.substituteSlug}. ` +
            `Remove and re-add ${names} to pick up ${rule.substituteSlug}, or run \`yarn run-cli substitute --remove ${rule.slug}\``,
        )
      }
    }

    if (rule.substituteSource === 'url' && !plugins.all.url[rule.substitute]) {
      ruleProblems.push(
        `${rule.substituteSlug} substitutes for ${rule.slug}, but no url plugin ${rule.substituteSlug} is in plugins.json. ` +
          `Run \`yarn run-cli add url:${rule.substitute}@<version>@<url>\`, or \`yarn run-cli substitute --remove ${rule.slug}\``,
      )
    }

    return ruleProblems
  })
  if (problems.length > 0) throw new UserError(`Refusing to install:\n${problems.join('\n')}`)
}

/**
 * Throws if any plugin in `toRemove` is the substitute in a rule, which would leave the rule pointing at a plugin
 * that is gone. remove runs it before deleting anything.
 */
export function assertNotSubstituting(plugins: Plugins, toRemove: { plugin: Plugin; id: string }[]) {
  const rules = Object.values(plugins.config.substitutes ?? {})
  const problems = toRemove.flatMap(({ plugin, id }) => {
    const rule = rules.find((r) => r.substituteSource === plugin.source && r.substitute === id)
    if (!rule) return []
    return [
      `${rule.substituteSlug} substitutes for ${rule.slug}. Run \`yarn run-cli substitute --remove ${rule.slug}\` first`,
    ]
  })
  if (problems.length > 0) throw new UserError(`Refusing to remove:\n${problems.join('\n')}`)
}
