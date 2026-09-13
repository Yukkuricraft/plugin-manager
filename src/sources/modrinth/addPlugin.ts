import { type Plugins } from '../../pluginList.js'
import { overridesFor, resolveTarget, sameOverrides } from '../../resolution.js'
import { output } from '../../utils/output.js'
import type { AddFlags } from '../pluginSource.js'
import client from './client.js'
import { addRequiredDependencies, formatDependencyInfo, getPluginVersion } from './utils.js'
import { MissingDataError, RequestError } from '../../errors.js'

export default async function addPlugin(plugins: Plugins, pluginIndicator: string, flags: AddFlags) {
  let plugin
  let version = null
  if (pluginIndicator.includes('@')) {
    ;[plugin, version] = pluginIndicator.split('@')
  } else {
    plugin = pluginIndicator
  }

  if (plugins.added[`modrinth:${plugin}`]) {
    if (version && version === plugins.added[`modrinth:${plugin}`]) {
      // The requested version already matches what's added, but the loader or Minecraft version it resolves
      // against this run might not match what's recorded, e.g. a new --loader flag. Only skip the update
      // when the resolved overrides are still the same as before.
      const recorded = Object.values(plugins.all.modrinth).find((p) => p.slug === plugin)
      const resolved = resolveTarget(plugins.config, recorded?.overrides, flags)
      if (sameOverrides(recorded?.overrides, overridesFor(resolved))) {
        output.info(
          `Plugin ${output.pluginName(plugin)} already in added list with the specified version. Exiting early`,
        )
        return false
      }
      output.info(
        `Plugin ${output.pluginName(plugin)} already in added list with the specified version, but a different loader or Minecraft version. Updating`,
      )
    } else if (version) {
      output.info(
        `Plugin ${output.pluginName(plugin)} already in added list. Updating it to the desired version instead`,
      )
    } else {
      output.info(
        `Plugin ${output.pluginName(plugin)} already in added list, but no version specified in command. Updating`,
      )
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
    throw new RequestError('Failed to get project', { cause: projectRes.error })
  }
  const project = projectRes.data

  // Resolved per plugin, since a loader override recorded on an existing entry only applies to that plugin
  const existing = plugins.all.modrinth[project.id]
  const resolved = resolveTarget(plugins.config, existing?.overrides, flags)
  for (const deviation of resolved.deviations) {
    const setting = deviation.field === 'loader' ? 'loader' : 'Minecraft version'
    output.warning(
      `${project.slug ?? plugin} resolves against ${setting} ${deviation.usedValue} instead of ${deviation.configValue} from plugins.json. Recorded as an override`,
    )
  }

  const { projectVersion, dependencies: depInfos } = await getPluginVersion(project.id, resolved.loader, {
    targetVersion: version ?? undefined,
    displayFor: plugin,
    gameVersion: resolved.gameVersion,
    featured: flags.featured,
  })

  if (!project.slug || !projectVersion.version_number) {
    throw new MissingDataError('Project slug or version number not found')
  }

  const existingDependedOnBy = existing ? existing.dependedOnBy : new Set<string>()
  const overrides = overridesFor(resolved)

  if (existing) delete plugins.all.modrinth[project.id]

  plugins.added[`modrinth:${project.slug}`] = projectVersion.version_number
  const versionFile = projectVersion.files.find((f) => f.primary) ?? projectVersion.files[0]

  plugins.all.modrinth[project.id] = {
    source: 'modrinth',
    slug: project.slug,
    version: projectVersion.version_number,
    versionId: projectVersion.id,
    sha512: versionFile.hashes.sha512 ?? null,
    sha1: versionFile.hashes.sha1 ?? null,
    size: versionFile.size,
    filename: versionFile.filename,
    publishedAt: projectVersion.date_published,
    dependedOnBy: existingDependedOnBy,
    overrides,
  }

  // Update the plugins ahead of formatting dependency info, so we can show conflicts on newly added plugins
  addRequiredDependencies(
    plugins.all.modrinth,
    depInfos.map((dep) => ({ dep, dependant: project.id })),
  )

  if (depInfos.length > 0) {
    output.dependency(`${output.pluginName(project.slug)} has dependencies:`)
    for (const d of depInfos) {
      console.log(`  ${formatDependencyInfo(d, plugins, 2)}`)
    }
  }

  output.success(`Adding ${output.pluginName(project.title ?? plugin)}`)
  output.pluginCard({
    title: project.title,
    slug: project.slug,
    version: projectVersion.version_number,
    versionType: projectVersion.version_type,
    loaders: projectVersion.loaders ?? undefined,
    mcVersions: projectVersion.game_versions ?? undefined,
    overrides,
    filename: versionFile.filename,
    size: versionFile.size,
    publishedAt: projectVersion.date_published,
    // The version page rather than the project page, so the exact build being downloaded is what
    // gets confirmed
    url: `https://modrinth.com/plugin/${project.slug}/version/${projectVersion.id}`,
  })
  return true
}
