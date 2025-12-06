import { loadPlugins, Plugins, writePlugins } from '../pluginList.js'
import installPlugins from './installPlugins.js'
import * as prompts from '@inquirer/prompts'
import { formatDependencyInfo, getPluginVersion } from '../utils.js'
import semver from 'semver'
import chalk from 'chalk'
import fs from 'fs/promises'

export default async function updatePlugins(gameVersion?: string, featured?: boolean) {
  const existingPlugins = await loadPlugins()

  const newPlugins: Plugins = {
    added: {},
    all: [],
  }

  const changes = []
  for (const plugin of existingPlugins.all) {
    if (!plugin.slug || !(plugin.slug in existingPlugins.added)) continue

    const version = await getPluginVersion(plugin.id, {
      gameVersion,
      featured,
      displayFor: plugin.slug,
      fromDate: plugin.publishedAt,
      changelog: true,
    })

    const versionIndicator = version.projectVersion.version_number ?? version.projectVersion.name
    if (!versionIndicator) throw new Error(`Plugin ${plugin.id} has no version number of name`)

    const primaryFile = version.projectVersion.files.find((f) => f.primary) ?? version.projectVersion.files[0]

    changes.push({
      slug: plugin.slug,
      oldVersion: plugin.version,
      newVersion: version,
      newVersionStr: versionIndicator,
      primaryFile,
    })
  }

  newPlugins.added = Object.fromEntries(changes.map((c) => [c.slug, c.newVersionStr]))

  const newProjectIds = changes.map((c) => c.newVersion.projectVersion.project_id)

  newPlugins.all.push(
    ...changes.map((c) => ({
      slug: c.slug,
      id: c.newVersion.projectVersion.project_id,
      version: c.newVersionStr,
      versionId: c.newVersion.projectVersion.id,
      filename: c.primaryFile.filename,
      size: c.primaryFile.size,
      sha512: c.primaryFile.hashes.sha512 ?? null,
      sha1: c.primaryFile.hashes.sha1 ?? null,
      publishedAt: c.newVersion.projectVersion.date_published,
      dependedOnBy: new Set<string>(),
    })),
  )

  const depsToProcess = changes.flatMap((c) =>
    c.newVersion.dependencies.map((d) => ({ dep: d, dependant: c.newVersion.projectVersion.project_id })),
  )

  for (let { dep, dependant } of depsToProcess) {
    if (dep.type !== 'required') continue

    const existing = newPlugins.all.find((p) => p.id === dep.projectId)
    if (existing?.version && dep.version && semver.compare(existing.version, dep.version) >= 0) {
      existing.dependedOnBy.add(dependant)
      continue
    } else if (existing) {
      newPlugins.all.splice(newPlugins.all.indexOf(existing), 1)
    }

    const dependedOnBy = existing?.dependedOnBy ?? new Set<string>()
    dependedOnBy.add(dependant)

    newPlugins.all.push({
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
    newProjectIds.push(dep.projectId)

    for (const depDep of dep.dependencies) {
      depsToProcess.push({ dep: depDep, dependant: dep.projectId })
    }
  }

  for (const c of changes) {
    if (c.newVersion.dependencies.length > 0) {
      console.log(
        `${c.slug} has dependencies:\n${c.newVersion.dependencies.map((d) => '  ' + formatDependencyInfo(d, newPlugins, 2)).join('\n')}`,
      )
    }
  }

  const removedPlugins = existingPlugins.all.filter((p) => newProjectIds.includes(p.id) === false)
  const addedPlugins = newProjectIds.filter((p) => existingPlugins.all.find((ep) => ep.id === p) === undefined)
  const changesVersions = existingPlugins.all
    .filter((p) => newProjectIds.includes(p.id))
    .map((oldPlugin) => {
      const newPlugin = newPlugins.all.find((p) => p.id === oldPlugin.id)
      return {
        slug: oldPlugin.slug,
        oldVersion: oldPlugin.version,
        newVersion: newPlugin?.version ?? newPlugin?.filename ?? '',
      }
    })
    .filter((p) => p.oldVersion !== p.newVersion)

  const changelog =
    '# Changelog\n\n' +
    changes
      .map(
        (c) =>
          `## ${c.slug}\n${c.newVersion.changelog.map(([version, message]) => `### ${version}\n${message}`).join('\n\n')}`,
      )
      .join('\n\n')

  let summary = ''
  if (removedPlugins.length > 0) {
    summary += `Removed plugins:
${removedPlugins.map((p) => `  ${chalk.red(p.slug)}`).join('\n')}`
  }

  if (addedPlugins.length > 0) {
    summary += `Added plugins:
${addedPlugins.map((p) => `  ${chalk.green(p)}`).join('\n')}`
  }

  if (changesVersions.length > 0) {
    summary += `Changes:
${changesVersions.map((p) => `  ${chalk.yellow(`${p.slug}: ${p.oldVersion} -> ${p.newVersion}'`)}`).join('\n')}`
  }

  console.log(summary)

  const contine = await prompts.confirm({
    message: 'Continue?',
  })
  if (!contine) return
  await writePlugins(newPlugins)
  await fs.writeFile('changelog.md', changelog, 'utf-8')

  await installPlugins()
}
