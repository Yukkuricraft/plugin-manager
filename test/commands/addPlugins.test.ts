import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../../src/errors.js'
import { type Plugins } from '../../src/pluginList.js'
import addPlugins from '../../src/commands/addPlugins.js'

const { loadPlugins, writePlugins, confirm, installPlugins, modrinthAdd, urlAdd } = vi.hoisted(() => ({
  loadPlugins: vi.fn(),
  writePlugins: vi.fn(),
  confirm: vi.fn(),
  installPlugins: vi.fn(),
  modrinthAdd: vi.fn(),
  urlAdd: vi.fn(),
}))

vi.mock('../../src/pluginList.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlugins,
  writePlugins,
}))
vi.mock('@inquirer/prompts', () => ({ confirm }))
vi.mock('../../src/commands/installPlugins.js', () => ({ default: installPlugins }))

const modrinthSource = { prefix: 'modrinth', addPlugin: modrinthAdd }
const urlSource = { prefix: 'url', addPlugin: urlAdd }

vi.mock('../../src/sources/pluginSource.js', () => ({
  getPluginSource: (query: string) =>
    query.startsWith('url:')
      ? { source: urlSource, strippedQuery: query.slice('url:'.length) }
      : { source: modrinthSource, strippedQuery: query },
}))

function plugins(): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.4' },
    added: {},
    all: { modrinth: {}, url: {} },
  }
}

beforeEach(() => {
  for (const fn of [loadPlugins, writePlugins, confirm, installPlugins, modrinthAdd, urlAdd]) fn.mockReset()
  loadPlugins.mockResolvedValue(plugins())
  modrinthAdd.mockResolvedValue(false)
  urlAdd.mockResolvedValue(false)
  confirm.mockResolvedValue(false)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('addPlugins', () => {
  it('refuses --path for a plugin that is not from a URL, naming it', async () => {
    await expect(addPlugins('./plugins.json', ['luckperms'], { path: 'expansions' })).rejects.toThrow(UserError)
    await expect(addPlugins('./plugins.json', ['luckperms'], { path: 'expansions' })).rejects.toThrow('luckperms')

    expect(modrinthAdd).not.toHaveBeenCalled()
  })

  it('refuses --path before adding any plugin in the same run', async () => {
    await expect(
      addPlugins('./plugins.json', ['url:essentials@1.0.0@https://files.example/E.jar', 'luckperms'], {
        path: 'expansions',
      }),
    ).rejects.toThrow(UserError)

    expect(urlAdd).not.toHaveBeenCalled()
  })

  it('passes --path through to the url source', async () => {
    await addPlugins('./plugins.json', ['url:essentials@1.0.0@https://files.example/E.jar'], { path: 'expansions' })

    expect(urlAdd).toHaveBeenCalledWith(expect.anything(), 'essentials@1.0.0@https://files.example/E.jar', {
      path: 'expansions',
    })
  })

  it('adds a Modrinth plugin when no --path is given', async () => {
    await addPlugins('./plugins.json', ['luckperms'], {})

    expect(modrinthAdd).toHaveBeenCalledOnce()
  })
})
