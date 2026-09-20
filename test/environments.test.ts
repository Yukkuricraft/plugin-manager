import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UserError } from '../src/errors.js'
import { resolvePluginsPath } from '../src/environments.js'

let dir: string
let environmentsPath: string
let serverDir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'environments-'))
  environmentsPath = path.join(dir, 'environments.json')
  serverDir = path.join(dir, 'env1-plugins')
  await fs.mkdir(serverDir)
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

async function writeEnvironments(contents: unknown) {
  await fs.writeFile(environmentsPath, typeof contents === 'string' ? contents : JSON.stringify(contents))
}

describe('resolvePluginsPath', () => {
  it('defaults to the plugins.json in the working directory', async () => {
    await expect(resolvePluginsPath({}, environmentsPath)).resolves.toBe('./plugins.json')
  })

  it('returns the path given, without reading environments.json', async () => {
    // environments.json is deliberately never written, so reading it would throw
    await expect(resolvePluginsPath({ pluginsJson: '/srv/env1/plugins.json' }, environmentsPath)).resolves.toBe(
      '/srv/env1/plugins.json',
    )
  })

  it('resolves a name to the plugins.json in its directory, whether or not that file exists yet', async () => {
    await writeEnvironments({ env1: serverDir })

    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).resolves.toBe(
      path.join(serverDir, 'plugins.json'),
    )
  })

  it('rejects a name when environments.json is missing, naming the file', async () => {
    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow(UserError)
    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow(environmentsPath)
  })

  it('rejects a name the file does not define, listing the ones it does', async () => {
    await writeEnvironments({ env7: serverDir, env1: serverDir })

    await expect(resolvePluginsPath({ env: 'env2' }, environmentsPath)).rejects.toThrow('It defines env1, env7')
  })

  it('rejects environments.json that is not valid JSON', async () => {
    await writeEnvironments('{')

    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow('is not valid JSON')
  })

  it('rejects a mapping whose value is not a string', async () => {
    await writeEnvironments({ env1: { dir: serverDir } })

    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow(
      'must be an object mapping a name to a directory',
    )
  })

  it('rejects a directory that does not exist, rather than pointing at init', async () => {
    const missing = path.join(dir, 'gone')
    await writeEnvironments({ env1: missing })

    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow(
      `maps env1 to ${missing}, which doesn't exist`,
    )
  })

  it('rejects a mapping that points at the plugins.json instead of its directory', async () => {
    const file = path.join(serverDir, 'plugins.json')
    await fs.writeFile(file, '{}')
    await writeEnvironments({ env1: file })

    await expect(resolvePluginsPath({ env: 'env1' }, environmentsPath)).rejects.toThrow(
      `maps env1 to ${file}, which isn't a directory`,
    )
  })
})
