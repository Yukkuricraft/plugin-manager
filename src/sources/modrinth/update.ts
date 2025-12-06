import semver from 'semver'

import { Plugins } from '../../pluginList.js'
import { formatDependencyInfo, getPluginVersion } from './utils.js'

export default async function update(
  existingPlugins: Plugins,
  newPlugins: Plugins,
  gameVersion?: string,
  featured?: boolean,
): Promise<{
  changelog: string
  removed: string[]
  added: string[]
  changed: { identifier: string; oldVersion: string; newVersion: string }[]
}> {
  const changes = []
  for (const id in existingPlugins.all.modrinth) {
    const plugin = existingPlugins.all.modrinth[id]
    if (!plugin.slug || !(plugin.slug in existingPlugins.all.modrinth)) continue

    const version = await getPluginVersion(id, {
      gameVersion,
      featured,
      displayFor: plugin.slug,
      fromDate: plugin.publishedAt,
      changelog: true,
    })

    const versionIndicator = version.projectVersion.version_number ?? version.projectVersion.name
    if (!versionIndicator) throw new Error(`Plugin ${id} has no version number or name`)

    const primaryFile = version.projectVersion.files.find((f) => f.primary) ?? version.projectVersion.files[0]

    changes.push({
      slug: plugin.slug,
      oldVersion: plugin.version,
      newVersion: version,
      newVersionStr: versionIndicator,
      primaryFile,
    })
  }

  newPlugins.added = {
    ...newPlugins.added,
    ...Object.fromEntries(changes.map((c) => [`modrinth:${c.slug}`, c.newVersionStr])),
  }

  const newProjectIds = changes.map((c) => c.newVersion.projectVersion.project_id)

  newPlugins.all.modrinth = Object.fromEntries(
    changes.map(
      (c) =>
        [
          c.newVersion.projectVersion.project_id,
          {
            source: 'modrinth' as const,
            slug: c.slug,
            version: c.newVersionStr,
            versionId: c.newVersion.projectVersion.id,
            filename: c.primaryFile.filename,
            size: c.primaryFile.size,
            sha512: c.primaryFile.hashes.sha512 ?? null,
            sha1: c.primaryFile.hashes.sha1 ?? null,
            publishedAt: c.newVersion.projectVersion.date_published,
            dependedOnBy: new Set<string>(),
          },
        ] as const,
    ),
  )

  const depsToProcess = changes.flatMap((c) =>
    c.newVersion.dependencies.map((d) => ({ dep: d, dependant: c.newVersion.projectVersion.project_id })),
  )

  for (let { dep, dependant } of depsToProcess) {
    if (dep.type !== 'required') continue

    const existing = newPlugins.all.modrinth[dep.projectId]
    if (existing?.version && dep.version && semver.compare(existing.version, dep.version) >= 0) {
      existing.dependedOnBy.add(dependant)
      continue
    } else if (existing) {
      delete newPlugins.all.modrinth[dep.projectId]
    }

    const dependedOnBy = existing?.dependedOnBy ?? new Set<string>()
    dependedOnBy.add(dependant)

    newPlugins.all.modrinth[dep.projectId] = {
      source: 'modrinth' as const,
      slug: dep.projectSlug ?? null,
      version: dep.version ?? null,
      versionId: dep.versionId,
      sha512: dep.sha512,
      sha1: dep.sha1,
      size: dep.size,
      filename: dep.filename,
      publishedAt: dep.publishedAt,
      dependedOnBy: dependedOnBy,
    }
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

  const removedPlugins = Object.entries(existingPlugins.all.modrinth).filter(([id]) => !newProjectIds.includes(id))
  const addedPlugins = newProjectIds
    .filter((p) => existingPlugins.all.modrinth[p] === undefined)
    .map((p) => newPlugins.all.modrinth[p]!.slug ?? p)
  const changedVersions = Object.entries(existingPlugins.all.modrinth)
    .filter(([id]) => newProjectIds.includes(id))
    .map(([id, oldPlugin]) => {
      const newPlugin = newPlugins.all.modrinth[id]
      return {
        identifier: oldPlugin.slug ?? id,
        oldVersion: oldPlugin.version,
        newVersion: newPlugin?.version ?? newPlugin?.filename ?? '',
      }
    })
    .filter((p) => p.oldVersion !== p.newVersion)

  const changelog = changes
    .map(
      (c) =>
        `## ${c.slug}\n${c.newVersion.changelog.map(([version, message]) => `### ${version}\n${message}`).join('\n\n')}`,
    )
    .join('\n\n')

  return {
    changelog,
    removed: removedPlugins.map(([id, p]) => p.slug ?? id),
    added: addedPlugins,
    changed: changedVersions,
  }
}
