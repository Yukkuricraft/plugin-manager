import * as prompts from '@inquirer/prompts'
import fs from 'node:fs/promises'
import z from 'zod'

import { UserError, ValidationError } from '../errors.js'
import { releasesFor } from '../sources/ghRelease/releases.js'
import { jarSignature } from '../utils/files.js'
import {
  createDraftRelease,
  deleteRelease,
  listReleases,
  parseRepo,
  publishRelease,
  requireGithubToken,
  tagExists,
  uploadReleaseAsset,
} from '../utils/github.js'
import { output } from '../utils/output.js'

export const defaultPublishConfigPath = './publish.json'

const publishConfig = z.object({ repo: z.string() })

async function readSavedRepo(configPath: string): Promise<string | undefined> {
  let str: string
  try {
    str = await fs.readFile(configPath, 'utf-8')
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'ENOENT') return undefined
    throw e
  }

  let raw: unknown
  try {
    raw = JSON.parse(str)
  } catch (e) {
    throw new UserError(`${configPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  const parsed = publishConfig.safeParse(raw)
  if (!parsed.success) {
    throw new UserError(`${configPath} must look like { "repo": "owner/name" }`)
  }
  return parsed.data.repo
}

// --repo wins, then the repo saved in publish.json, then a prompt whose answer is saved for next time
async function resolveRepo(flag: string | undefined, configPath: string): Promise<string> {
  if (flag !== undefined) {
    parseRepo(flag)
    return flag
  }
  const saved = await readSavedRepo(configPath)
  if (saved !== undefined) {
    parseRepo(saved)
    return saved
  }

  const repo = await prompts.input({
    message: 'GitHub repo to publish releases to (owner/name):',
    validate: (value) => {
      try {
        parseRepo(value.trim())
        return true
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
  })
  const trimmed = repo.trim()
  await fs.writeFile(configPath, JSON.stringify({ repo: trimmed }, null, 2) + '\n')
  return trimmed
}

async function requireJar(jar: string): Promise<void> {
  let head: Buffer
  try {
    const file = await fs.open(jar, 'r')
    try {
      const buffer = Buffer.alloc(jarSignature.length)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      head = buffer.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  } catch (e) {
    throw new UserError(`Can't read ${jar}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!head.equals(jarSignature)) {
    throw new UserError(`${jar} isn't a JAR file`)
  }
}

// The plugin's display name, from the newest release under the prefix: its title up to " v<digit>", else its first
// word. With no titled release under the prefix, the user gives it
async function displayName(id: string, previousTitle: string | null | undefined): Promise<string> {
  const title = previousTitle?.trim()
  if (title) return title.match(/^(.*?) v\d/)?.[1] ?? title.split(/\s+/)[0]
  return (await prompts.input({ message: `Display name of ${id}, for release titles:`, default: id })).trim() || id
}

/**
 * Creates a release tagged `<id>/<version>` in the release repo with the JAR attached. The release is created as a
 * draft and published once the upload succeeds, and the draft is deleted if the upload or publish fails.
 */
export default async function publish(
  id: string,
  version: string,
  jar: string,
  flags: { repo?: string },
  configPath = defaultPublishConfigPath,
): Promise<void> {
  if (!id || id.includes('/') || id.includes('@')) {
    throw new ValidationError(`Invalid plugin id "${id}". It must be non-empty and contain no "/" or "@"`)
  }
  const checkVersion = (value: string) => {
    if (!value || /\s/.test(value)) {
      throw new ValidationError(`Invalid version "${value}". It must be non-empty and contain no whitespace`)
    }
  }
  checkVersion(version)
  await requireJar(jar)

  const repo = await resolveRepo(flags.repo, configPath)
  // Checked here rather than by the first request, which only reads and would ask for too little
  requireGithubToken(`Publishing to ${repo}`, repo, 'write')
  const all = await listReleases(repo, { includeDrafts: true })
  const taken = new Set(all.map((release) => release.tag_name))

  for (;;) {
    const tag = `${id}/${version}`
    if (taken.has(tag)) {
      output.warning(`${tag} already exists in ${repo}`)
    } else if (await tagExists(repo, tag)) {
      output.warning(`${tag} already exists in ${repo} as a tag with no release`)
    } else {
      break
    }
    version = await prompts.input({
      message: 'Use a different version:',
      validate: (value) => (!value || /\s/.test(value) ? 'Must be non-empty and contain no whitespace' : true),
    })
    checkVersion(version)
  }

  const previous = releasesFor(
    all.filter((release) => !release.draft),
    id,
  )[0]
  const display = await displayName(id, previous?.name)
  const title = await prompts.input({ message: 'Release title:', default: `${display} v${version}` })

  const tag = `${id}/${version}`
  const draft = await createDraftRelease(repo, tag, title)
  let published
  try {
    await uploadReleaseAsset(draft, jar)
    published = await publishRelease(repo, draft.id)
  } catch (e) {
    await deleteRelease(repo, draft.id).catch((deleteError: unknown) => {
      const reason = deleteError instanceof Error ? deleteError.message : String(deleteError)
      output.warning(
        `The draft release ${draft.id} of ${tag} remains in ${repo} because deleting it failed: ${reason}. Delete it on GitHub before publishing ${tag} again`,
      )
    })
    throw e
  }

  output.success(`Published ${tag}`)
  output.info(published.html_url)
}
