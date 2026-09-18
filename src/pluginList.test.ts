import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UserError } from './errors.js'
import { loadPlugins, type Plugins, pluginsExist, writePlugins } from './pluginList.js'
import { modrinthEntry } from './testFixtures.js'

let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugins-json-'))
  file = path.join(dir, 'plugins.json')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const v2: Plugins = {
  version: 2,
  config: { loader: 'paper', gameVersion: '1.21.1' },
  added: { 'modrinth:worldedit': '7.4.5' },
  all: {
    modrinth: {
      '1u6JkXh5': modrinthEntry({
        slug: 'worldedit',
        version: '7.4.5',
        dependedOnBy: new Set(['other']),
        overrides: { loader: 'spigot', gameVersion: '1.20.4' },
      }),
    },
    url: {},
  },
}

describe('loadPlugins', () => {
  it('rejects a missing file, pointing at init', async () => {
    await expect(loadPlugins(file)).rejects.toThrow(UserError)
    await expect(loadPlugins(file)).rejects.toThrow('Run `yarn run-cli init`')
  })

  it('rejects a version 1 file with the migration message', async () => {
    await fs.writeFile(file, JSON.stringify({ version: 1, added: {}, all: { modrinth: {}, url: {} } }))
    await expect(loadPlugins(file)).rejects.toThrow(
      'plugins.json is version 1, but this needs version 2. Delete plugins.json and run `yarn run-cli init`',
    )
  })

  it('rejects a file with no version before trying to parse it', async () => {
    await fs.writeFile(file, JSON.stringify({ added: {} }))
    await expect(loadPlugins(file)).rejects.toThrow(UserError)
  })

  it('rejects invalid JSON with a UserError instead of a raw SyntaxError', async () => {
    await fs.writeFile(file, '{not valid json')
    await expect(loadPlugins(file)).rejects.toThrow(UserError)
    await expect(loadPlugins(file)).rejects.toThrow('plugins.json is not valid JSON')
  })

  it('rejects a version 2 file that fails the schema with a UserError instead of a raw ZodError', async () => {
    await fs.writeFile(
      file,
      JSON.stringify({
        version: 2,
        config: { loader: 'not-a-loader', gameVersion: '1.21.1' },
        added: {},
        all: { modrinth: {}, url: {} },
      }),
    )
    await expect(loadPlugins(file)).rejects.toThrow(UserError)
    await expect(loadPlugins(file)).rejects.toThrow("plugins.json doesn't match the expected format")
  })

  it('round-trips a version 2 file, including overrides and dependedOnBy', async () => {
    await writePlugins(v2, file)
    expect(await loadPlugins(file)).toEqual(v2)
  })
})

describe('pluginsExist', () => {
  it('reports whether the file is there', async () => {
    expect(await pluginsExist(file)).toBe(false)
    await writePlugins(v2, file)
    expect(await pluginsExist(file)).toBe(true)
  })
})
