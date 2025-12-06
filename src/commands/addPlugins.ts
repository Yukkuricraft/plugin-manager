import * as prompts from '@inquirer/prompts'
import chalk from 'chalk'
import client from '../client.js'
import { loadPlugins, Plugins, writePlugins } from '../pluginList.js'
import semver from 'semver'
import installPlugins from './installPlugins.js'
import { formatDependencyInfo, getPluginVersion } from '../utils.js'

async function addPlugin(plugins: Plugins, pluginIndicator: string, gameVersion?: string, featured?: boolean) {
  let plugin,
    version = null
  if (pluginIndicator.includes('@')) {
    ;[plugin, version] = pluginIndicator.split('@')
  } else {
    plugin = pluginIndicator
  }

  if (plugins.added[plugin]) {
    if (version) {
      if (version !== plugins.added[plugin]) {
        console.log(chalk.blue('Plugin already in added list. Updating it to the desired version instead'))
      } else {
        console.log(chalk.blue('Plugin already in added list with the specified version. Exiting early'))
      }
    } else {
      console.log(chalk.blue('Plugin already in added list, but no version specified in command. Updating'))
    }
  }

  const projectRes = await client.GET('/project/{id|slug}', {
    params: {
      path: {
        'id|slug': plugin,
      },
    },
  })
  if (!projectRes.data) {
    throw new Error('Failed to get project', { cause: projectRes.error })
  }
  const project = projectRes.data

  const { projectVersion, dependencies: depInfos } = await getPluginVersion(project.id, {
    targetVersion: version ?? undefined,
    displayFor: plugin,
    gameVersion,
    featured,
  })

  if (!project.slug || !projectVersion.version_number) {
    throw new Error('Project slug or version number not found')
  }

  const existingAllIdx = plugins.all.findIndex((p) => p.id === project.id)
  const existingDependedOnBy = existingAllIdx !== -1 ? plugins.all[existingAllIdx].dependedOnBy : new Set<string>()

  if (existingAllIdx !== -1) plugins.all.splice(existingAllIdx, 1)

  plugins.added[project.slug] = projectVersion.version_number
  const versionFile = projectVersion.files.find((f) => f.primary) ?? projectVersion.files[0]

  plugins.all.push({
    slug: project.slug,
    id: project.id,
    version: projectVersion.version_number,
    versionId: projectVersion.id,
    sha512: versionFile.hashes.sha512 ?? null,
    sha1: versionFile.hashes.sha1 ?? null,
    size: versionFile.size,
    filename: versionFile.filename,
    publishedAt: projectVersion.date_published,
    dependedOnBy: existingDependedOnBy,
  })

  // Update the plugins ahead of formatting dependency info, so we can show conflicts on newly added plugins
  const depsToProcess = []
  depsToProcess.push(...depInfos.map((d) => ({ dep: d, dependant: project.id })))
  for (const { dep, dependant } of depsToProcess) {
    if (dep.type !== 'required') continue

    const existing = plugins.all.find((p) => p.id === dep.projectId)
    if (existing?.version && dep.version && semver.compare(existing.version, dep.version) >= 0) {
      existing.dependedOnBy.add(dependant)
      continue
    } else if (existing) {
      plugins.all.splice(plugins.all.indexOf(existing), 1)
    }

    const dependedOnBy = existing?.dependedOnBy ?? new Set<string>()
    dependedOnBy.add(dependant)

    plugins.all.push({
      slug: dep.projectSlug ?? null,
      id: dep.projectId,
      version: dep.version ?? null,
      versionId: dep.versionId,
      sha512: dep.sha512,
      sha1: dep.sha1,
      size: dep.size,
      filename: dep.filename,
      publishedAt: dep.publishedAt,
      dependedOnBy: dependedOnBy,
    })

    for (const depDep of dep.dependencies) {
      depsToProcess.push({ dep: depDep, dependant: dep.projectId })
    }
  }

  if (depInfos.length > 0) {
    console.log(
      `${project.slug} has dependencies:\n${depInfos.map((d) => '  ' + formatDependencyInfo(d, plugins, 2)).join('\n')}`,
    )
  }

  console.log(chalk.yellow(`Adding ${project.title ?? plugin}`))
}

export default async function addPlugins(pluginIndicators: string[], gameVersion?: string, featured?: boolean) {
  const plugins = await loadPlugins()

  for (const pluginIndicator of pluginIndicators) {
    // Explicitly not parallel
    await addPlugin(plugins, pluginIndicator, gameVersion, featured)
  }

  const contine = await prompts.confirm({
    message: 'Continue?',
  })
  if (!contine) return

  await writePlugins(plugins)
  await installPlugins()
}
