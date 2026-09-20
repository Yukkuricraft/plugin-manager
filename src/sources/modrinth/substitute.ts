import { dependantNames, isAddedModrinthPlugin, type Plugins, type SubstituteRule } from '../../pluginList.js'
import client from './client.js'
import { RequestError, UserError } from '../../errors.js'

/** Looks up a Modrinth project by slug or ID, for its ID and current slug */
async function findProject(query: string): Promise<{ id: string; slug: string }> {
  const res = await client.GET('/project/{id|slug}', { params: { path: { 'id|slug': query } } })
  if (!res.data) {
    if (res.response.status === 404) throw new UserError(`No Modrinth project found for ${query}`)
    throw new RequestError('Failed to get project', { cause: res.error })
  }
  return { id: res.data.id, slug: res.data.slug ?? res.data.id }
}

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
