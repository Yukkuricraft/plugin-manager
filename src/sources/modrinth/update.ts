import { Plugins } from '../../pluginList.js'
import { output } from '../../utils/output.js'
import { type Loader } from './loaders.js'
import { addRequiredDependencies, formatDependencyInfo, getPluginVersion } from './utils.js'
import { MissingDataError } from '../../errors.js'

export default async function update(
  existingPlugins: Plugins,
  newPlugins: Plugins,
  loader: Loader,
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
    if (!plugin.slug || !(`modrinth:${plugin.slug}` in existingPlugins.added)) continue

    const version = await getPluginVersion(id, loader, {
      gameVersion,
      featured,
      displayFor: plugin.slug,
      fromDate: plugin.publishedAt,
      changelog: true,
    })

    const versionIndicator = version.projectVersion.version_number ?? version.projectVersion.name
    if (!versionIndicator) throw new MissingDataError(`Plugin ${id} has no version number or name`)

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

  addRequiredDependencies(
    newPlugins.all.modrinth,
    changes.flatMap((c) =>
      c.newVersion.dependencies.map((dep) => ({ dep, dependant: c.newVersion.projectVersion.project_id })),
    ),
  )
  // Everything left after resolving, whether updated directly or pulled in as a dependency
  const newProjectIds = Object.keys(newPlugins.all.modrinth)

  for (const c of changes) {
    if (c.newVersion.dependencies.length > 0) {
      output.dependency(`${output.pluginName(c.slug)} has dependencies:`)
      for (const d of c.newVersion.dependencies) {
        console.log(`  ${formatDependencyInfo(d, newPlugins, 2)}`)
      }
    }
  }

  const removedPlugins = Object.entries(existingPlugins.all.modrinth).filter(([id]) => !newProjectIds.includes(id))
  const addedPlugins = newProjectIds
    .filter((p) => existingPlugins.all.modrinth[p] === undefined)
    .map((p) => newPlugins.all.modrinth[p].slug ?? p)
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
