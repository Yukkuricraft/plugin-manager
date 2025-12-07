import fs from 'fs/promises'

import type { components } from './modrinth.js'

import { AllPlugins } from '../../pluginList.js'
import { output } from '../../utils/output.js'
import client from './client.js'
import { downloadFile, fileHash } from '../../utils/files.js'
import { MissingDataError, RequestError, ValidationError } from '../../errors.js'

export default async function install(plugins: AllPlugins): Promise<void> {
  const versionsRes = await client.GET('/versions', {
    params: {
      query: {
        ids: JSON.stringify(Object.values(plugins.modrinth).map((p) => p.versionId)),
      },
    },
  })
  if (!versionsRes.data) {
    throw new RequestError('Could not get versions', { cause: versionsRes.error })
  }

  const versions = versionsRes.data
  const primaryFile: Record<string, components['schemas']['VersionFile']> = {}
  const projectIdByHash: Record<string, string> = {}

  for (const id in plugins.modrinth) {
    const plugin = plugins.modrinth[id]
    const version = versions.find((v) => v.id === plugin.versionId)
    if (!version) {
      throw new MissingDataError(`Version ${plugin.versionId} not found`)
    }

    const versionFile = version.files.find((f) => f.primary) ?? version.files[0]

    if (versionFile.hashes.sha512 !== plugin.sha512 && versionFile.hashes.sha1 !== plugin.sha1) {
      throw new ValidationError(`Plugin ${plugin.slug}@${plugin.version} has different hashes. Run update and try again`)
    }

    primaryFile[id] = versionFile

    if (versionFile.hashes.sha512) projectIdByHash[versionFile.hashes.sha512] = version.project_id
    if (versionFile.hashes.sha1) projectIdByHash[versionFile.hashes.sha1] = version.project_id
  }

  const existingFiles = await fs.readdir('./managedPlugins')

  const projectsToSkip: string[] = []

  const existingFileHashes = await Promise.all(
    existingFiles.map((f) => fileHash(`./managedPlugins/${f}`).then((h) => [f, h] as const)),
  )
  for (const [file, hashes] of existingFileHashes) {
    const projectId = projectIdByHash[hashes.sha512 ?? hashes.sha1]
    if (!projectId) {
      await fs.rm(`./managedPlugins/${file}`)
    } else {
      output.file(file, 'skipped')
      projectsToSkip.push(projectId)
    }
  }

  await Promise.all(
    Object.keys(plugins.modrinth)
      .filter((id) => !projectsToSkip.includes(id))
      .map(async (id) => {
        const file = primaryFile[id]
        await downloadFile(file.url, {
          id,
          filename: file.filename,
          sha512: file.hashes.sha512,
          sha1: file.hashes.sha1,
        })
      }),
  )
}
