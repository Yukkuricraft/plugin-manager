import * as prompts from '@inquirer/prompts'

import { type PluginOverrides, type Plugins } from '../../pluginList.js'
import { clearGameVersionOverride, grantGameVersionOverride, resolveTarget } from '../../resolution.js'
import { output } from '../../utils/output.js'
import type { OverrideChange, UpdateTarget } from '../pluginSource.js'
import { newestSupportedGameVersion } from './gameVersions.js'
import { addRequiredDependencies, carryOverPlugins, formatDependencyInfo, getPluginVersion } from './utils.js'
import { MissingDataError, NoCompatibleVersionError, UserError } from '../../errors.js'

export default async function update(
  existingPlugins: Plugins,
  newPlugins: Plugins,
  target: UpdateTarget,
): Promise<{
  changelog: string
  removed: string[]
  added: string[]
  changed: { identifier: string; oldVersion: string; newVersion: string }[]
  overrides: OverrideChange[]
}> {
  // Resolve every plugin against a copy of the configuration already moved to the target version, rather
  // than passing the target as a --game-version flag, so it is the configured version, not a deviation.
  const config = { ...existingPlugins.config, gameVersion: target.gameVersion }

  const changes = []
  const kept: { id: string; slug: string; overrides: PluginOverrides | undefined }[] = []
  const overrideChanges: OverrideChange[] = []
  for (const id in existingPlugins.all.modrinth) {
    const plugin = existingPlugins.all.modrinth[id]
    if (!plugin.slug || !(`modrinth:${plugin.slug}` in existingPlugins.added)) continue

    const resolved = resolveTarget(config, plugin.overrides, {})
    // A dependency resolves inside this call too, so its NoCompatibleVersionError surfaces here as well.
    const version = await getPluginVersion(id, resolved.loader, {
      gameVersion: resolved.gameVersion,
      featured: target.featured,
      displayFor: plugin.slug,
      name: plugin.slug,
      fromDate: plugin.publishedAt,
      changelog: true,
    }).catch((e: unknown) => {
      if (e instanceof NoCompatibleVersionError) return e
      throw e
    })

    if (version instanceof NoCompatibleVersionError) {
      // A plugin already held back keeps its recorded version; otherwise it lags at the current config version.
      const lagsAt = plugin.overrides?.gameVersion ?? existingPlugins.config.gameVersion
      const alreadyLagging = plugin.overrides?.gameVersion !== undefined
      // lagsAt equals the target when the plugin isn't behind the target and just has no compatible build
      // this run (e.g. with --featured). A plugin at the configured Minecraft version carries no game
      // version override, so any it has is cleared rather than granted.
      const staysAtTarget = lagsAt === target.gameVersion
      await keepOrAbort(
        { id, slug: plugin.slug, version: plugin.version, lagsAt, alreadyLagging, staysAtTarget },
        version,
        target,
      )

      kept.push({
        id,
        slug: plugin.slug,
        overrides: staysAtTarget
          ? clearGameVersionOverride(plugin.overrides)
          : grantGameVersionOverride(plugin.overrides, lagsAt),
      })
      if (staysAtTarget) {
        // The plugin's existing override matched the target exactly, so it's stale and cleared, the same way
        // a plugin that resolves successfully at the target has its override cleared below.
        if (plugin.overrides?.gameVersion !== undefined) {
          overrideChanges.push({
            identifier: plugin.slug,
            change: 'cleared',
            gameVersion: plugin.overrides.gameVersion,
          })
        }
      } else if (!alreadyLagging) {
        overrideChanges.push({ identifier: plugin.slug, change: 'granted', gameVersion: lagsAt })
      }
      continue
    }

    const versionIndicator = version.projectVersion.version_number ?? version.projectVersion.name
    if (!versionIndicator) throw new MissingDataError(`Plugin ${id} has no version number or name`)

    const primaryFile = version.projectVersion.files.find((f) => f.primary) ?? version.projectVersion.files[0]

    // Reaching the target means the plugin is no longer lagging, so any Minecraft version override it had
    // is cleared and reported as such.
    if (plugin.overrides?.gameVersion !== undefined) {
      overrideChanges.push({ identifier: plugin.slug, change: 'cleared', gameVersion: plugin.overrides.gameVersion })
    }

    changes.push({
      slug: plugin.slug,
      oldVersion: plugin.version,
      newVersion: version,
      newVersionStr: versionIndicator,
      primaryFile,
      overrides: clearGameVersionOverride(plugin.overrides),
    })
  }

  newPlugins.added = {
    ...newPlugins.added,
    ...Object.fromEntries(changes.map((c) => [`modrinth:${c.slug}`, c.newVersionStr])),
    ...Object.fromEntries(kept.map((k) => [`modrinth:${k.slug}`, existingPlugins.added[`modrinth:${k.slug}`]])),
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
            overrides: c.overrides,
          },
        ] as const,
    ),
  )

  // Kept plugins, and everything they depend on, are copied over as they were instead of re-resolved; only
  // the kept plugin's own overrides are updated, just below. This runs before addRequiredDependencies, so a
  // dependency also needed by an updated plugin still resolves via the newer-build-wins comparison there.
  carryOverPlugins(
    existingPlugins.all.modrinth,
    newPlugins.all.modrinth,
    kept.map((k) => k.id),
  )
  for (const k of kept) newPlugins.all.modrinth[k.id].overrides = k.overrides

  addRequiredDependencies(
    newPlugins.all.modrinth,
    changes.flatMap((c) =>
      c.newVersion.dependencies.map((dep) => ({ dep, dependant: c.newVersion.projectVersion.project_id })),
    ),
  )
  // Whatever remains at this point is in the new plugin set for one of three reasons: it was updated
  // directly, it was kept at its current build, or it was pulled in as a dependency of one of those.
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
    overrides: overrideChanges,
  }
}

/**
 * Handles a plugin (or one of its dependencies) having no version compatible with the target. Reports what
 * blocked it and, if it's known, how far behind that blocker actually is, then asks whether to keep the
 * plugin at its current build. Returns normally if the user agrees to keep it; throws a UserError naming the
 * same details if they'd rather abort. Nothing is written yet at that point: updatePlugins only writes
 * plugins.json once every plugin source has finished.
 */
async function keepOrAbort(
  plugin: {
    id: string
    slug: string
    version: string
    lagsAt: string
    alreadyLagging: boolean
    staysAtTarget: boolean
  },
  error: NoCompatibleVersionError,
  target: UpdateTarget,
) {
  const blocker = error.projectId === plugin.id ? plugin.slug : `its dependency ${error.projectName}`
  // A failed lookup only loses an extra detail in the message, so it shouldn't stop the update.
  const newest = await newestSupportedGameVersion(error.projectId, error.loader).catch(() => undefined)
  const details = [
    `${plugin.slug} can't be updated to Minecraft ${target.gameVersion}: ${blocker} has no${error.featured ? ' featured' : ''} ${error.loader} version supporting it`,
    newest
      ? `The newest ${error.loader} version of ${error.projectName} supports up to Minecraft ${newest}`
      : undefined,
    // Not shown when staysAtTarget: the keep about to happen clears that hold-back rather than confirming it.
    plugin.alreadyLagging && !plugin.staysAtTarget
      ? `${plugin.slug} is already held back at Minecraft ${plugin.lagsAt}`
      : undefined,
  ].filter((d) => d !== undefined)

  output.warning(details.join('. '))
  const keep = await prompts.select({
    message: plugin.staysAtTarget
      ? `Keep ${plugin.slug} at ${plugin.version}?`
      : `Keep ${plugin.slug} at ${plugin.version}, recorded as lagging at Minecraft ${plugin.lagsAt}?`,
    choices: [
      { name: `Keep ${plugin.version}`, value: true },
      { name: 'Abort the update', value: false },
    ],
  })
  if (!keep) throw new UserError(`Update aborted, nothing was written. ${details.join('. ')}`)
}
