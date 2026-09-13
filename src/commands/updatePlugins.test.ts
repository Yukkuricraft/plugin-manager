import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError } from '../errors.js'
import { type Plugins } from '../pluginList.js'
import updatePlugins from './updatePlugins.js'

const { loadPlugins, writePlugins, chooseGameVersion, confirm, installPlugins, writeFile, sourceUpdate } = vi.hoisted(
  () => ({
    loadPlugins: vi.fn(),
    writePlugins: vi.fn(),
    chooseGameVersion: vi.fn(),
    confirm: vi.fn(),
    installPlugins: vi.fn(),
    writeFile: vi.fn(),
    sourceUpdate: vi.fn(),
  }),
)

vi.mock('../pluginList.js', () => ({ loadPlugins, writePlugins }))
vi.mock('../sources/modrinth/gameVersions.js', () => ({ chooseGameVersion }))
vi.mock('@inquirer/prompts', () => ({ confirm }))
vi.mock('./installPlugins.js', () => ({ default: installPlugins }))
vi.mock('fs/promises', () => ({ default: { writeFile } }))
vi.mock('../sources/pluginSource.js', () => ({ allPluginSources: [{ update: sourceUpdate }] }))

function existingPlugins(): Plugins {
  return {
    version: 2,
    config: { loader: 'paper', gameVersion: '1.21.1' },
    added: {},
    all: { modrinth: {}, url: {} },
  }
}

const noChanges = { changelog: '', removed: [], added: [], changed: [], overrides: [] }

beforeEach(() => {
  loadPlugins.mockReset().mockResolvedValue(existingPlugins())
  writePlugins.mockReset()
  chooseGameVersion.mockReset()
  confirm.mockReset()
  installPlugins.mockReset()
  writeFile.mockReset()
  sourceUpdate.mockReset().mockResolvedValue(noChanges)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('updatePlugins', () => {
  it('retargets and writes even when no plugin changed, once the user confirms', async () => {
    chooseGameVersion.mockResolvedValue('1.21.4')
    confirm.mockResolvedValue(true)

    await updatePlugins({})

    expect(writePlugins).toHaveBeenCalledOnce()
    const [written] = writePlugins.mock.calls[0] as [Plugins]
    expect(written.config.gameVersion).toBe('1.21.4')
    expect(written.config.loader).toBe('paper')
    expect(installPlugins).toHaveBeenCalledOnce()
  })

  it('reports no updates available and writes nothing when the target is unchanged and nothing changed', async () => {
    chooseGameVersion.mockResolvedValue('1.21.1')

    await updatePlugins({})

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('No updates available')
    expect(confirm).not.toHaveBeenCalled()
    expect(writePlugins).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })

  it('rejects with a source UserError without writing anything', async () => {
    chooseGameVersion.mockResolvedValue('1.21.4')
    const error = new UserError('Update aborted, nothing was written. some reason')
    sourceUpdate.mockRejectedValue(error)

    await expect(updatePlugins({})).rejects.toBe(error)

    expect(writePlugins).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })

  it('writes nothing when the user declines to continue', async () => {
    chooseGameVersion.mockResolvedValue('1.21.4')
    confirm.mockResolvedValue(false)

    await updatePlugins({})

    expect(writePlugins).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })
})
