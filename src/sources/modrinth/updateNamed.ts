import { MissingDataError, UserError } from '../../errors.js'
import {
  type AllModrinthPlugins,
  dependantNames,
  isAddedModrinthPlugin,
  type ModrinthPlugin,
  type PluginOverrides,
  type Plugins,
} from '../../pluginList.js'
import { clearGameVersionOverride, resolveTarget } from '../../resolution.js'
import { output } from '../../utils/output.js'
import type { OverrideChange, UpdateResult } from '../pluginSource.js'
import { diffModrinth } from './diff.js'
import { type Loader } from './loaders.js'
import type { components } from './modrinth.js'
import modrinthSource from './modrinthSource.js'
import { listBuilds, pickBuild } from './pickBuild.js'
import { addRequiredDependencies, getPluginVersion } from './utils.js'

/**
 * The project IDs of the entries in `all` that only the plugins in `named` need: entries that weren't added
 * themselves and whose every dependant is in `named` or is one of these entries.
 */
export function exclusiveDependencies(
  all: AllModrinthPlugins,
  added: Plugins['added'],
  named: Set<string>,
): Set<string> {
  const exclusive = new Set<string>()
  const onlyNamed = (id: string) => named.has(id) || exclusive.has(id)
  let grew = true
  while (grew) {
    grew = false
    for (const [id, entry] of Object.entries(all)) {
      if (exclusive.has(id) || named.has(id) || entry.dependedOnBy.size === 0) continue
      if (entry.slug !== null && `modrinth:${entry.slug}` in added) continue
      if ([...entry.dependedOnBy].every(onlyNamed)) {
        exclusive.add(id)
        grew = true
      }
    }
  }
  return exclusive
}

interface Change {
  id: string
  slug: string
  old: ModrinthPlugin
  loader: Loader
  gameVersion: string
  build: components['schemas']['Version']
  overrides: PluginOverrides | undefined
}

/**
 * Lets the user pick a new build of each Modrinth plugin in `ids`, for the configured Minecraft version, and updates
 * `next`, which this mutates. Dependencies only those plugins use are resolved again; the rest keep their builds.
 */
export async function updateNamed(next: Plugins, ids: string[]): Promise<UpdateResult> {
  const before = next.all.modrinth
  next.all.modrinth = Object.fromEntries(
    Object.entries(before).map(([id, p]) => [id, { ...p, dependedOnBy: new Set(p.dependedOnBy) }]),
  )
  const all = next.all.modrinth
  const { config } = next

  const targets = new Map<string, ModrinthPlugin>()
  for (const query of new Set(ids)) {
    const found = await modrinthSource.findPlugin(query, next.all)
    if (!found) throw new UserError(`No Modrinth plugin ${query} in plugins.json`)
    if (!isAddedModrinthPlugin(next, found.plugin)) {
      const name = found.plugin.slug ?? found.id
      const dependants = dependantNames(before, found.plugin)
      if (dependants.length === 0) {
        throw new UserError(`${name} wasn't added to plugins.json, and no plugin depends on it`)
      }
      const instead = dependants.length === 1 ? dependants[0] : 'one of those'
      throw new UserError(`${name} is only a dependency of ${dependants.join(', ')}. Update ${instead} instead`)
    }
    targets.set(found.id, found.plugin)
  }

  const changes: Change[] = []
  const overrideChanges: OverrideChange[] = []
  for (const [id, old] of targets) {
    // isAddedModrinthPlugin only accepts entries with a slug
    const slug = old.slug ?? id
    const { loader } = resolveTarget(config, old.overrides, {})
    const held = old.overrides?.gameVersion
    let gameVersion = config.gameVersion
    let builds = await listBuilds(id, loader, gameVersion)
    if (builds.length === 0 && held !== undefined) {
      gameVersion = held
      builds = await listBuilds(id, loader, gameVersion)
    }
    if (builds.length === 0) {
      output.warning(`${slug} has no candidate builds for Minecraft ${gameVersion}`)
      continue
    }

    const build = await pickBuild(slug, builds, old.versionId)
    // A build for the configured version brings the plugin up to date, so its Minecraft version override goes
    const clears = held !== undefined && gameVersion === config.gameVersion
    const overrides = clears ? clearGameVersionOverride(old.overrides) : old.overrides
    if (clears) overrideChanges.push({ identifier: slug, change: 'cleared', gameVersion: held })

    if (build.id === old.versionId) {
      all[id].overrides = overrides
      continue
    }
    changes.push({ id, slug, old, loader, gameVersion, build, overrides })
  }

  const changed = new Set(changes.map((c) => c.id))
  const exclusive = exclusiveDependencies(before, next.added, changed)
  const replaced = new Set([...changed, ...exclusive])

  for (const id of replaced) delete all[id]
  for (const entry of Object.values(all)) {
    for (const id of replaced) entry.dependedOnBy.delete(id)
  }

  // Every changed plugin goes in before any dependency is resolved, so one that depends on another finds its
  // picked build in the lockfile
  for (const c of changes) {
    const version = c.build.version_number ?? c.build.name
    if (!version) throw new MissingDataError(`Plugin ${c.id} has no version number or name`)
    const file = c.build.files.find((f) => f.primary) ?? c.build.files[0]
    all[c.id] = {
      source: 'modrinth',
      slug: c.slug,
      version,
      versionId: c.build.id,
      filename: file.filename,
      size: file.size,
      sha512: file.hashes.sha512 ?? null,
      sha1: file.hashes.sha1 ?? null,
      publishedAt: c.build.date_published,
      dependedOnBy: new Set([...c.old.dependedOnBy].filter((d) => !replaced.has(d))),
      overrides: c.overrides,
    }
    next.added[`modrinth:${c.slug}`] = version
  }

  const changelogs: [string, [string, string][]][] = []
  for (const c of changes) {
    const resolved = await getPluginVersion(c.id, c.loader, {
      targetVersionId: c.build.id,
      gameVersion: c.gameVersion,
      displayFor: c.slug,
      fromDate: c.old.publishedAt,
      changelog: true,
      // Locked entries resolve to the build they're at, so the dependencies left in the lockfile keep their pins
      dependencyContext: { substitutes: config.substitutes, locked: all },
    })
    addRequiredDependencies(
      all,
      resolved.dependencies.map((dep) => ({ dep, dependant: c.id })),
    )
    changelogs.push([c.slug, resolved.changelog])
  }

  const changelog = changelogs
    .map(
      ([slug, entries]) =>
        `## ${slug}\n${entries.map(([version, message]) => `### ${version}\n${message}`).join('\n\n')}`,
    )
    .join('\n\n')

  reportDependencies(before, all, changed, exclusive)
  return { changelog, ...diffModrinth(before, all), overrides: overrideChanges }
}

/**
 * Says what happened to each entry that a replaced plugin or dependency depended on: re-resolved, removed because no
 * new build needs it, or kept at its build because something else uses it too
 */
function reportDependencies(
  before: AllModrinthPlugins,
  after: AllModrinthPlugins,
  changed: Set<string>,
  exclusive: Set<string>,
) {
  const name = (id: string) => before[id]?.slug ?? id
  const list = (ids: string[]) => ids.map(name).sort().join(', ')
  for (const [id, entry] of Object.entries(before)) {
    if (changed.has(id)) continue
    const dependants = [...entry.dependedOnBy]
    const replacedDependants = dependants.filter((d) => changed.has(d) || exclusive.has(d))
    if (replacedDependants.length === 0) continue

    const users = list(replacedDependants)
    if (exclusive.has(id)) {
      if (id in after) {
        output.info(`Updating ${name(id)} because only ${users} ${replacedDependants.length > 1 ? 'use' : 'uses'} it`)
      } else {
        output.info(`Removing ${name(id)} because only ${users} used it`)
      }
      continue
    }
    const others = dependants.filter((d) => !replacedDependants.includes(d))
    const because =
      others.length > 0 ? `plugins other than ${users} use it (${list(others)})` : 'it was added to plugins.json itself'
    output.warning(`Not updating ${name(id)} because ${because}`)
  }
}
