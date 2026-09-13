import * as prompts from '@inquirer/prompts'
import chalk from 'chalk'
import semver from 'semver'

import type { components } from './modrinth.js'

import { type AllModrinthPlugins, Plugins } from '../../pluginList.js'
import { output, symbols } from '../../utils/output.js'
import client from './client.js'
import { type Loader, loaderCandidates, mostLoaderSpecific } from './loaders.js'
import { MissingDataError, NoCompatibleVersionError, RequestError, SanityCheckError, UserError } from '../../errors.js'

export interface ExternalDependencyInfo {
  type: 'external'
  filename: string | null | undefined
}

export interface DependencyInfoBase {
  projectSlug: string | undefined
  projectId: string
  version: string
  versionId: string
  sha512: string | null
  sha1: string | null
  size: number
  filename: string
  publishedAt: string
}

export interface EmbeddedDependencyInfo {
  type: 'embedded'
}

export interface RequiredDependencyInfo extends DependencyInfoBase {
  type: 'required'
  dependencies: DependencyInfo[]
}

export interface MiscDependencyInfo extends DependencyInfoBase {
  type: 'optional' | 'incompatible'
}

export type DependencyInfo =
  | EmbeddedDependencyInfo
  | ExternalDependencyInfo
  | RequiredDependencyInfo
  | MiscDependencyInfo

export async function getDependencyInfo(
  dep: components['schemas']['VersionDependency'],
  loader: Loader,
  gameVersion?: string,
): Promise<DependencyInfo> {
  if (dep.dependency_type === 'embedded') {
    return {
      type: 'embedded',
    }
  }

  if (!dep.project_id) {
    return {
      type: 'external',
      filename: dep.file_name,
    }
  }

  const projectRes = await client.GET('/project/{id|slug}', {
    params: {
      path: {
        'id|slug': dep.project_id,
      },
    },
  })
  if (!projectRes.data) {
    throw new RequestError('Failed to get dependency project', { cause: projectRes.error })
  }

  let version: components['schemas']['Version']
  let dependencyInfo: DependencyInfo[] | undefined
  if (dep.version_id) {
    const versionRes = await client.GET('/project/{id|slug}/version/{id|number}', {
      params: {
        path: {
          'id|slug': dep.project_id,
          'id|number': dep.version_id,
        },
      },
    })
    if (!versionRes.data) {
      throw new RequestError('Failed to get dependency version', { cause: versionRes.error })
    }
    version = versionRes.data
  } else {
    const ver = await getPluginVersion(dep.project_id, loader, { gameVersion, name: projectRes.data.slug })
    version = ver.projectVersion
    dependencyInfo = ver.dependencies
  }

  const versionIndicator = version.version_number ?? version.name
  if (!versionIndicator) {
    throw new MissingDataError('Dependency version number or name not found')
  }

  const versionFile = version.files.find((f) => f.primary) ?? version.files[0]

  const baseReturn = {
    projectSlug: projectRes.data.slug,
    projectId: projectRes.data.id,
    version: versionIndicator,
    versionId: version.id,
    sha512: versionFile.hashes.sha512 ?? null,
    sha1: versionFile.hashes.sha1 ?? null,
    size: versionFile.size,
    filename: versionFile.filename,
    publishedAt: version.date_published,
  }

  switch (dep.dependency_type) {
    case 'required': {
      const depInfo = version.dependencies ?? []
      const deps = dependencyInfo ?? (await Promise.all(depInfo.map((d) => getDependencyInfo(d, loader, gameVersion))))

      return {
        type: 'required',
        dependencies: deps,
        ...baseReturn,
      }
    }
    case 'optional':
      return {
        type: 'optional',
        ...baseReturn,
      }
    case 'incompatible':
      return {
        type: 'incompatible',
        ...baseReturn,
      }
    default:
      throw new SanityCheckError(`Unexpected dependency type ${dep.dependency_type satisfies never}`)
  }
}

/**
 * Adds each required dependency in `deps`, and theirs in turn, to `modrinthPlugins`. A dependency already present at
 * the same or a newer version is kept, and only gains the dependant in its dependedOnBy. When an entry is replaced
 * by a newer build, its recorded overrides are kept.
 */
export function addRequiredDependencies(
  modrinthPlugins: AllModrinthPlugins,
  deps: { dep: DependencyInfo; dependant: string }[],
) {
  const depsToProcess = [...deps]
  for (const { dep, dependant } of depsToProcess) {
    if (dep.type !== 'required') continue

    const existing = modrinthPlugins[dep.projectId]
    const existingSemver = semver.coerce(existing?.version, { includePrerelease: true, rtl: true })
    const newSemver = semver.coerce(dep.version, { includePrerelease: true, rtl: true })
    if (existingSemver && newSemver && semver.compare(existingSemver, newSemver) >= 0) {
      existing.dependedOnBy.add(dependant)
      continue
    } else if (existing) {
      delete modrinthPlugins[dep.projectId]
    }

    const dependedOnBy = existing?.dependedOnBy ?? new Set<string>()
    dependedOnBy.add(dependant)

    modrinthPlugins[dep.projectId] = {
      source: 'modrinth',
      slug: dep.projectSlug ?? null,
      version: dep.version,
      versionId: dep.versionId,
      sha512: dep.sha512,
      sha1: dep.sha1,
      size: dep.size,
      filename: dep.filename,
      publishedAt: dep.publishedAt,
      dependedOnBy,
      // The entry being replaced here may be a plugin the user added themselves, with overrides
      // recorded on it, so those overrides need to carry over to the newer build
      overrides: existing?.overrides,
    }

    for (const depDep of dep.dependencies) {
      depsToProcess.push({ dep: depDep, dependant: dep.projectId })
    }
  }
}

/**
 * Copies the plugins named in `ids`, plus everything they transitively depend on, from `from` into
 * `into`, preserving every field except `dependedOnBy`, which only keeps the dependants that are also
 * being carried over.
 *
 * Used during update when a plugin (or one of its dependencies) has no version compatible with the new
 * Minecraft version, and the user chooses to keep its current build rather than abort. A plugin already
 * in `into` was resolved fresh: it's left as it is and gains the carried-over dependant, and its own
 * dependencies aren't carried, since addRequiredDependencies re-registers the ones it still needs.
 */
export function carryOverPlugins(from: AllModrinthPlugins, into: AllModrinthPlugins, ids: string[]) {
  // Entries already in `into` were resolved fresh, so the walk must not expand through them, nor
  // credit them as dependants on a copied entry - see the docblock above.
  const resolvedFresh = new Set(Object.keys(into))

  // Walk dependedOnBy outward from ids to find every plugin that ids need, directly or transitively
  const carried = new Set(ids)
  const pullsInDeps = (d: string) => carried.has(d) && !resolvedFresh.has(d)
  let grew = true
  while (grew) {
    grew = false
    for (const [id, plugin] of Object.entries(from)) {
      if (!carried.has(id) && [...plugin.dependedOnBy].some(pullsInDeps)) {
        carried.add(id)
        grew = true
      }
    }
  }

  for (const id of carried) {
    const dependants = [...from[id].dependedOnBy].filter(pullsInDeps)
    const resolved = into[id]
    if (resolved) {
      for (const d of dependants) resolved.dependedOnBy.add(d)
    } else {
      into[id] = { ...from[id], dependedOnBy: new Set(dependants) }
    }
  }
}

export function formatDependencyInfo(info: DependencyInfo, plugins: Plugins, indent: number): string {
  switch (info.type) {
    case 'embedded':
      return ''
    case 'external':
      if (info.filename === undefined) return ''
      else {
        return chalk.redBright(
          `${symbols.warning} External plugin ${info.filename}. Make sure to note it somewhere safe`,
        )
      }
    case 'incompatible': {
      const inPlugins = plugins.all.modrinth[info.projectId]
      if (inPlugins) {
        if (inPlugins.versionId === info.versionId) {
          return chalk.redBright(
            `${symbols.warning} Incompatible with plugin and version ${info.projectSlug}@${inPlugins.version}. Proceed with caution.`,
          )
        } else {
          return chalk.redBright(
            `${symbols.warning} Incompatible with plugin ${info.projectSlug}. Proceed with caution.`,
          )
        }
      } else {
        return ''
      }
    }
    case 'optional':
      return chalk.cyanBright(
        `${symbols.info} Optional dependency on ${info.projectSlug}. Add separately if you want to use this plugin`,
      )
    case 'required': {
      const indentStr = ' '.repeat(indent + 2)

      return `${info.projectSlug}:\n${info.dependencies.map((d) => indentStr + formatDependencyInfo(d, plugins, indent + 2)).join('\n')}`
    }
    default:
      throw new SanityCheckError(`Unexpected dependency type: ${info satisfies never}`)
  }
}

export async function getPluginVersion(
  projectId: string,
  loader: Loader,
  opts?: {
    displayFor?: string
    name?: string
    targetVersion?: string
    gameVersion?: string
    featured?: boolean
    fromDate?: undefined
    changelog?: undefined
  },
): Promise<{
  projectVersion: components['schemas']['Version']
  dependencies: DependencyInfo[]
}>
export async function getPluginVersion(
  projectId: string,
  loader: Loader,
  opts: {
    displayFor?: string
    name?: string
    targetVersion?: string
    gameVersion?: string
    featured?: boolean
    fromDate: string
    changelog: true
  },
): Promise<{
  projectVersion: components['schemas']['Version']
  dependencies: DependencyInfo[]
  changelog: [string, string][]
}>
export async function getPluginVersion(
  projectId: string,
  loader: Loader,
  opts?: {
    displayFor?: string
    name?: string
    targetVersion?: string
    gameVersion?: string
    featured?: boolean
    fromDate?: string
    changelog?: boolean
  },
): Promise<{
  projectVersion: components['schemas']['Version']
  dependencies: DependencyInfo[]
  changelog?: [string, string][]
}> {
  const { targetVersion, gameVersion, featured, fromDate, changelog, displayFor, name } = opts ?? {}
  // Dependencies pass name rather than displayFor, since displayFor also triggers the "Getting
  // dependencies of" log below, which would otherwise print once per dependency
  const projectName = name ?? displayFor ?? projectId
  const versionsRes = await client.GET('/project/{id|slug}/version', {
    params: {
      path: {
        'id|slug': projectId,
      },
      query: {
        game_versions: gameVersion ? JSON.stringify([gameVersion]) : undefined,
        // Modrinth treats featured=false as "only non-featured versions", so false means no filter instead
        featured: featured || undefined,
      },
    },
  })
  if (!versionsRes.data) {
    throw new RequestError('Failed to get versions', { cause: versionsRes.error })
  }
  const projectVersions = versionsRes.data
  const supportingGameVersion = gameVersion ? ` supporting Minecraft ${gameVersion}` : ''

  let projectVersion: components['schemas']['Version'] | undefined
  if (targetVersion) {
    const matchingVersion = projectVersions.filter((v) => v.version_number === targetVersion)
    if (matchingVersion.length === 0) {
      throw new UserError(`Version ${targetVersion} not found for plugin ${projectName}${supportingGameVersion}`)
    }

    // Resolve the loader within the requested version rather than across the whole project, so an
    // older version built for a different loader than the current ones is still reachable
    const candidates = mostLoaderSpecific(loaderCandidates(matchingVersion, loader))
    if (candidates.length === 0) {
      throw new UserError(`Version ${targetVersion} of plugin ${projectName} has no build compatible with ${loader}`)
    } else if (candidates.length === 1) {
      projectVersion = candidates[0]
    } else {
      projectVersion = await prompts.select({
        message: `Found multiple ${loader} builds of version ${targetVersion}`,
        choices: candidates.map((v) => ({ name: v.name, value: v })),
      })
    }
  } else {
    let lastReleaseVersion
    let lastBetaVersion
    let lastAlphaVersion

    const listedVersions = projectVersions.filter((v) => v.status !== 'unlisted')
    for (const projVersion of loaderCandidates(listedVersions, loader)) {
      switch (projVersion.version_type) {
        case 'alpha':
          if (!lastAlphaVersion) lastAlphaVersion = projVersion
          if (lastAlphaVersion.date_published < projVersion.date_published) lastAlphaVersion = projVersion

          break
        case 'beta':
          if (!lastBetaVersion) lastBetaVersion = projVersion
          if (lastBetaVersion.date_published < projVersion.date_published) lastBetaVersion = projVersion

          break
        case 'release':
          if (!lastReleaseVersion) lastReleaseVersion = projVersion
          if (lastReleaseVersion.date_published < projVersion.date_published) lastReleaseVersion = projVersion

          break
        default:
          throw new SanityCheckError('Unexpected version type')
      }
    }

    const all = [lastReleaseVersion, lastBetaVersion, lastAlphaVersion].filter((v) => v !== undefined)

    if (all.length === 0) {
      throw new NoCompatibleVersionError({ projectId, projectName, loader, gameVersion, featured })
    } else if (all.length === 1) {
      projectVersion = all[0]
    } else if (fromDate && all.every((v) => v.date_published <= fromDate)) {
      all.sort((a, b) => b.date_published.localeCompare(a.date_published))
      projectVersion = all[0]
    } else {
      projectVersion = await prompts.select({
        message: 'Found multiple candidate versions',
        choices: all.map((v) => ({ name: v.name, value: v })),
      })
    }
  }

  let changelogArr: [string, string][] | undefined
  if (changelog && fromDate) {
    changelogArr = projectVersions
      .filter(
        (v) =>
          v.date_published.localeCompare(fromDate) > 0 &&
          v.date_published.localeCompare(projectVersion.date_published) <= 0,
      )
      .map((v) => [v.name ?? v.version_number ?? v.id, v.changelog ?? ''] satisfies [string, string])
      .filter(([, changelog]) => changelog.length > 0)
  }

  const deps = projectVersion.dependencies ?? []
  if (deps.length !== 0 && displayFor) {
    output.info(
      `Getting dependencies of ${output.pluginName(displayFor)} ${output.version(projectVersion.version_number ?? projectVersion.name ?? 'unknown')}`,
    )
  }
  const depInfos = await Promise.all(deps.map((d) => getDependencyInfo(d, loader, gameVersion)))

  return { projectVersion, dependencies: depInfos, changelog: changelogArr }
}
