import * as prompts from '@inquirer/prompts'
import chalk from 'chalk'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

import type { components } from './modrinth.js'

import { Plugins } from '../../pluginList.js'
import client from './client.js'

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

export async function getDependencyInfo(dep: components['schemas']['VersionDependency']): Promise<DependencyInfo> {
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
    throw new Error('Failed to get dependency project', { cause: projectRes.error })
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
      throw new Error('Failed to get dependency version', { cause: versionRes.error })
    }
    version = versionRes.data
  } else {
    const ver = await getPluginVersion(dep.project_id)
    version = ver.projectVersion
    dependencyInfo = ver.dependencies
  }

  const versionIndicator = version.version_number ?? version.name
  if (!versionIndicator) {
    throw new Error('Dependency version number or name not found')
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
      const deps = dependencyInfo ?? (await Promise.all(depInfo.map(getDependencyInfo)))

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
      throw new Error(`Unexpected dependency type ${dep.dependency_type satisfies never}`)
  }
}

export function formatDependencyInfo(info: DependencyInfo, plugins: Plugins, indent: number): string {
  switch (info.type) {
    case 'embedded':
      return ''
    case 'external':
      if (info.filename === undefined) return ''
      else return chalk.red(`Extenal plugin ${info.filename}. Make sure to note it somewhere safe`)
    case 'incompatible': {
      const inPlugins = plugins.all.modrinth[info.projectId]
      if (inPlugins) {
        if (inPlugins.versionId === info.versionId) {
          return chalk.red(
            `Incompatible with plugin and version ${info.projectSlug}@${inPlugins.version}. Proceed with caution.`,
          )
        } else {
          return chalk.red(`Incompatible with plugin ${info.projectSlug}. Proceed with caution.`)
        }
      } else {
        return ''
      }
    }
    case 'optional':
      return chalk.blue(`Optional dependency on ${info.projectSlug}. Add seperately if you want to use this plugin`)
    case 'required': {
      const indentStr = ' '.repeat(indent + 2)

      return `${info.projectSlug}:\n${info.dependencies.map((d) => indentStr + formatDependencyInfo(d, plugins, indent + 2)).join('\n')}`
    }
    default:
      throw new Error(`Unexpected dependency type: ${info satisfies never}`)
  }
}

export async function getPluginVersion(
  projectId: string,
  opts?: {
    displayFor?: string
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
  opts: {
    displayFor?: string
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
  opts?: {
    displayFor?: string
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
  const { targetVersion, gameVersion, featured, fromDate, changelog, displayFor } = opts ?? {}
  const versionsRes = await client.GET('/project/{id|slug}/version', {
    params: {
      path: {
        'id|slug': projectId,
      },
      query: {
        game_versions: gameVersion ? JSON.stringify([gameVersion]) : undefined,
        featured,
      },
    },
  })
  if (!versionsRes.data) {
    throw new Error('Failed to get versions', { cause: versionsRes.error })
  }
  const projectVersions = versionsRes.data

  let projectVersion: components['schemas']['Version'] | undefined
  if (targetVersion) {
    projectVersion = projectVersions.find((v) => v.version_number === targetVersion)
    if (!projectVersion) {
      throw new Error(`Version ${targetVersion} not found for plugin ${displayFor}`)
    }
  } else {
    let lastReleaseVersion
    let lastBetaVersion
    let lastAlphaVersion

    for (const projVersion of projectVersions) {
      if (projVersion.status === 'unlisted') continue
      if (projVersion.loaders?.includes('paper')) {
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
            throw new Error('Unexpected version type')
        }
      }
    }

    const all = [lastReleaseVersion, lastBetaVersion, lastAlphaVersion].filter((v) => v !== undefined)

    if (all.length === 0) {
      throw new Error('No versions found for plugin')
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
  if (changelog) {
    changelogArr = projectVersions
      .filter((v) => v.date_published.localeCompare(projectVersion.date_published) > 0)
      .map((v) => [v.name ?? v.version_number ?? v.id, v.changelog ?? ''] satisfies [string, string])
      .filter(([, changelog]) => changelog.length > 0)
  }

  const deps = projectVersion.dependencies ?? []
  if (deps.length !== 0 && displayFor) {
    console.log(
      chalk.blue(`Getting dependencies of ${displayFor} ${projectVersion.version_number ?? projectVersion.name}`),
    )
  }
  const depInfos = await Promise.all(deps.map(getDependencyInfo))

  return { projectVersion, dependencies: depInfos, changelog: changelogArr }
}

export function fileHash(file: string) {
  return new Promise<{ sha1: string; sha512: string }>((resolve, reject) => {
    const sha1 = createHash('sha1')
    const sha512 = createHash('sha512')
    sha1.setEncoding('hex')
    sha512.setEncoding('hex')

    const stream = createReadStream(file)
    stream.pipe(sha1)
    stream.pipe(sha512)

    stream.once('error', reject)

    stream.once('end', () => {
      resolve({
        sha1: sha1.read() as string,
        sha512: sha512.read() as string,
      })
    })
  })
}
