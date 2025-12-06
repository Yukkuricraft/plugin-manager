import chalk from 'chalk'
import fs from 'fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

import type { components } from './modrinth.js'

import { AllPlugins } from '../../pluginList.js'
import client from './client.js'
import { fileHash } from './utils.js'

export default async function install(plugins: AllPlugins): Promise<void> {
  const versionsRes = await client.GET('/versions', {
    params: {
      query: {
        ids: JSON.stringify(Object.values(plugins.modrinth).map((p) => p.versionId)),
      },
    },
  })
  if (!versionsRes.data) {
    throw new Error('Could not get versions', { cause: versionsRes.error })
  }

  const versions = versionsRes.data
  const primaryFile: Record<string, components['schemas']['VersionFile']> = {}
  const projectIdByHash: Record<string, string> = {}

  for (const id in plugins.modrinth) {
    const plugin = plugins.modrinth[id]
    const version = versions.find((v) => v.id === plugin.versionId)
    if (!version) {
      throw new Error(`Version ${plugin.versionId} not found`)
    }

    const versionFile = version.files.find((f) => f.primary) ?? version.files[0]

    if (versionFile.hashes.sha512 !== plugin.sha512 && versionFile.hashes.sha1 !== plugin.sha1) {
      throw new Error(`Plugin ${plugin.slug}@${plugin.version} has different hashes. Run update and try again`)
    }

    primaryFile[id] = versionFile

    if (versionFile.hashes.sha512) projectIdByHash[versionFile.hashes.sha512] = version.project_id
    if (versionFile.hashes.sha1) projectIdByHash[versionFile.hashes.sha1] = version.project_id
  }

  await fs.rm('./plugins', { recursive: true, force: true })
  await fs.mkdir('./managedPlugins', { recursive: true })
  await fs.mkdir('./unmanagedPlugins', { recursive: true })
  let existingFiles = await fs.readdir('./managedPlugins')

  const projectsToSkip: string[] = []

  const existingFileHashes = await Promise.all(
    existingFiles.map((f) => fileHash(`./managedPlugins/${f}`).then((h) => [f, h] as const)),
  )
  for (const [file, hashes] of existingFileHashes) {
    const projectId = projectIdByHash[hashes.sha512 ?? hashes.sha1]
    if (!projectId) {
      await fs.rm(`./managedPlugins/${file}`)
    } else {
      console.log(chalk.blue(`File matches for ./managedPlugins/${file}, skipping`))
      projectsToSkip.push(projectId)
    }
  }

  await Promise.all(
    Object.keys(plugins.modrinth)
      .filter((id) => !projectsToSkip.includes(id))
      .map(async (id) => {
        const file = primaryFile[id]
        const res = await fetch(file.url)
        if (!res.ok || !res.body) throw new Error(`Failed to download ${file.url}`)

        const fileStream = createWriteStream(`./managedPlugins/${file.filename}`)
        await finished(Readable.fromWeb(res.body as any).pipe(fileStream))
        console.log(chalk.green(`Downloaded ./managedPlugins/${file.filename}`))
      }),
  )

  console.log()
  console.log(chalk.green('Done downloading! Reconstructing plugins folder'))

  await fs.cp('./managedPlugins', './plugins', { recursive: true, force: true })
  await fs.cp('./unmanagedPlugins', './plugins', { recursive: true, force: true })
}
