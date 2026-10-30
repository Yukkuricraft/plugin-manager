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
import {
  addRequiredDependencies,
  type DependencyInfo,
  formatDependencyInfo,
  getPluginVersion,
  type RequiredDependencyInfo,
} from './utils.js'

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
    let builds = await listBuilds(id, loader, gameVersion, old.versionId)
    if (builds.length === 0 && held !== undefined) {
      gameVersion = held
      builds = await listBuilds(id, loader, gameVersion, old.versionId)
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

  // The entries in the lockfile now: kept entries and the picked builds. They keep their builds even when a new
  // build pins another, since other plugins use them or the user just picked them
  const lockOverPins = new Set(Object.keys(all))
  const changelogs: [string, [string, string][]][] = []
  const trees: [string, DependencyInfo[]][] = []
  const pins: Pin[] = []
  for (const c of changes) {
    const resolved = await getPluginVersion(c.id, c.loader, {
      targetVersionId: c.build.id,
      gameVersion: c.gameVersion,
      displayFor: c.slug,
      fromDate: c.old.publishedAt,
      changelog: true,
      // Locked entries resolve to the build they're at, so the dependencies left in the lockfile keep their pins
      dependencyContext: { substitutes: config.substitutes, locked: all, lockOverPins },
    })
    addRequiredDependencies(
      all,
      resolved.dependencies.map((dep) => ({ dep, dependant: c.id })),
    )
    changelogs.push([c.slug, resolved.changelog])
    trees.push([c.slug, resolved.dependencies])
    pins.push(...overriddenPins(c.id, resolved.dependencies))
  }

  for (const [slug, dependencies] of trees) {
    if (dependencies.length === 0) continue
    output.dependency(`${output.pluginName(slug)} has dependencies:`)
    for (const d of dependencies) console.log(`  ${formatDependencyInfo(d, next, 2)}`)
  }

  const changelog = changelogs
    .map(
      ([slug, entries]) =>
        `## ${slug}\n${entries.map(([version, message]) => `### ${version}\n${message}`).join('\n\n')}`,
    )
    .join('\n\n')

  reportDependencies(before, all, next.added, changed, exclusive, pins)
  return { changelog, ...diffModrinth(before, all), overrides: overrideChanges }
}

/** A dependency pin that `dependant`'s new build has on `projectId`, which the lockfile's build overrode */
interface Pin {
  dependant: string
  projectId: string
  pinned: string
  kept: string
}

/** The pins in the dependency tree of `dependant` that the lockfile's builds overrode */
function overriddenPins(dependant: string, dependencies: DependencyInfo[]): Pin[] {
  return dependencies
    .filter((d): d is RequiredDependencyInfo => d.type === 'required')
    .flatMap((d) => [
      ...(d.overriddenPin
        ? [{ dependant, projectId: d.projectId, pinned: d.overriddenPin.version, kept: d.version }]
        : []),
      ...overriddenPins(d.projectId, d.dependencies),
    ])
}

/**
 * Says what happened to each entry that a replaced plugin or dependency depended on, and to each entry that a new
 * build depends on: re-resolved, added, removed because no new build needs it, or kept at its build because
 * something else uses it too. Then warns about each pin a kept build overrode.
 */
function reportDependencies(
  before: AllModrinthPlugins,
  after: AllModrinthPlugins,
  added: Plugins['added'],
  changed: Set<string>,
  exclusive: Set<string>,
  pins: Pin[],
) {
  const name = (id: string) => before[id]?.slug ?? after[id]?.slug ?? id
  const list = (ids: Iterable<string>) => [...ids].map(name).sort().join(', ')
  const replaced = (id: string) => changed.has(id) || exclusive.has(id)
  // Why `id` keeps its build even though `users` changed
  const keptBecause = (id: string, users: string) => {
    if (changed.has(id)) return `it's the build picked for it`
    const others = [...(before[id]?.dependedOnBy ?? [])].filter((d) => !replaced(d))
    if (others.length > 0) return `plugins other than ${users} use it (${list(others)})`
    const slug = before[id]?.slug
    if (slug && `modrinth:${slug}` in added) return 'it was added to plugins.json itself'
    return 'it was already in plugins.json'
  }

  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (changed.has(id)) continue
    const old = before[id]
    const now = after[id]
    const oldDependants = [...(old?.dependedOnBy ?? [])]
    // The dependants that changed, or that depend on it for the first time
    const users = [
      ...new Set([
        ...oldDependants.filter(replaced),
        ...[...(now?.dependedOnBy ?? [])].filter((d) => !old?.dependedOnBy.has(d)),
      ]),
    ]
    if (users.length === 0) continue

    const userList = list(users)
    const plural = users.length > 1
    if (!now) {
      output.info(`Removing ${name(id)} because only ${userList} used it`)
    } else if (!old) {
      output.info(`Adding ${name(id)} because ${userList} ${plural ? 'need' : 'needs'} it`)
    } else if (now.versionId !== old.versionId) {
      const because = exclusive.has(id)
        ? `only ${userList} ${plural ? 'use' : 'uses'} it`
        : `${userList} ${plural ? 'need' : 'needs'} a newer build`
      output.info(`Updating ${name(id)} because ${because}`)
    } else if (exclusive.has(id)) {
      output.info(
        `Not updating ${name(id)} because ${now.version} is the build ${userList} ${plural ? 'need' : 'needs'}`,
      )
    } else {
      output.warning(`Not updating ${name(id)} because ${keptBecause(id, userList)}`)
    }
  }

  for (const pin of pins) {
    const dependant = name(pin.dependant)
    const dependency = name(pin.projectId)
    output.warning(
      `${dependant} pins ${dependency} ${pin.pinned}, but ${dependency} stays at ${pin.kept} because ${keptBecause(pin.projectId, dependant)}`,
    )
  }
}
