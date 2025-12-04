import client from '../client.js'
import { loadPlugins } from '../pluginList.js'
import fs from 'fs/promises'
import type { components } from '../modrinth.js'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import chalk from 'chalk'

function fileHash(file: string) {
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
        sha1: sha1.read(),
        sha512: sha512.read(),
      })
    })
  })
}

export default async function installPlugins() {
  const plugins = await loadPlugins()
  console.log(chalk.blue('Downloading plugins...'))

  const versionsRes = await client.GET('/versions', {
    params: {
      query: {
        ids: JSON.stringify(plugins.all.map((p) => p.versionId)),
      },
    },
  })
  if (!versionsRes.data) {
    throw new Error('Could not get versions', { cause: versionsRes.error })
  }

  const versions = versionsRes.data
  const primaryFile: Record<string, components['schemas']['VersionFile']> = {}
  const projectIdByHash: Record<string, string> = {}

  for (const plugin of plugins.all) {
    const version = versions.find((v) => v.id === plugin.versionId)
    if (!version) {
      throw new Error(`Version ${plugin.versionId} not found`)
    }

    const versionFile = version.files.find((f) => f.primary) ?? version.files[0]

    if (versionFile.hashes.sha512 !== plugin.sha512 && versionFile.hashes.sha1 !== plugin.sha1) {
      throw new Error(`Plugin ${plugin.slug}@${plugin.version} has different hashes. Run update and try again`)
    }

    primaryFile[plugin.id] = versionFile

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
    plugins.all
      .filter((p) => !projectsToSkip.includes(p.id))
      .map(async (p) => {
        const file = primaryFile[p.id]
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

  console.log()
  console.log(chalk.green('Done!'))
}
