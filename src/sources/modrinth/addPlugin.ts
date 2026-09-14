import { Plugins } from '../../pluginList.js'
import { output } from '../../utils/output.js'
import client from './client.js'
import { type Loader } from './loaders.js'
import { addRequiredDependencies, formatDependencyInfo, getPluginVersion } from './utils.js'
import { MissingDataError, RequestError } from '../../errors.js'

export default async function addPlugin(
  plugins: Plugins,
  pluginIndicator: string,
  loader: Loader,
  gameVersion?: string,
  featured?: boolean,
) {
  let plugin
  let version = null
  if (pluginIndicator.includes('@')) {
    ;[plugin, version] = pluginIndicator.split('@')
  } else {
    plugin = pluginIndicator
  }

  if (plugins.added[`modrinth:${plugin}`]) {
    if (version) {
      if (version !== plugins.added[`modrinth:${plugin}`]) {
        output.info(
          `Plugin ${output.pluginName(plugin)} already in added list. Updating it to the desired version instead`,
        )
      } else {
        output.info(
          `Plugin ${output.pluginName(plugin)} already in added list with the specified version. Exiting early`,
        )
        return false
      }
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

  const { projectVersion, dependencies: depInfos } = await getPluginVersion(project.id, loader, {
    targetVersion: version ?? undefined,
    displayFor: plugin,
    gameVersion,
    featured,
  })

  if (!project.slug || !projectVersion.version_number) {
    throw new MissingDataError('Project slug or version number not found')
  }

  const existing = plugins.all.modrinth[project.id]
  const existingDependedOnBy = existing ? existing.dependedOnBy : new Set<string>()

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
    filename: versionFile.filename,
    size: versionFile.size,
    publishedAt: projectVersion.date_published,
    // The version page rather than the project page, so the exact build being downloaded is what
    // gets confirmed
    url: `https://modrinth.com/plugin/${project.slug}/version/${projectVersion.id}`,
  })
  return true
}
