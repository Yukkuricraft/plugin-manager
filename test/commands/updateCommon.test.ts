import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Plugins } from '../../src/pluginList.js'
import { type UpdateResult } from '../../src/sources/pluginSource.js'
import { confirmAndWrite } from '../../src/commands/updateCommon.js'

const { writePlugins, confirm, installPlugins, writeFile } = vi.hoisted(() => ({
  writePlugins: vi.fn(),
  confirm: vi.fn(),
  installPlugins: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('../../src/pluginList.js', () => ({ writePlugins }))
vi.mock('@inquirer/prompts', () => ({ confirm }))
vi.mock('../../src/commands/installPlugins.js', () => ({ default: installPlugins }))
vi.mock('fs/promises', () => ({ default: { writeFile } }))

const next: Plugins = {
  version: 2,
  config: { loader: 'paper', gameVersion: '1.21.4' },
  added: {},
  all: { modrinth: {}, url: {}, 'gh-release': {} },
}

const noChanges: UpdateResult = { changelog: '', removed: [], added: [], changed: [], overrides: [] }
const oneChange: UpdateResult = {
  ...noChanges,
  changelog: '## vault',
  changed: [{ identifier: 'url:vault', oldVersion: '1.0.0', newVersion: '1.1.0' }],
}

beforeEach(() => {
  writePlugins.mockReset()
  confirm.mockReset()
  installPlugins.mockReset()
  writeFile.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('confirmAndWrite', () => {
  it('writes and installs when retargeting even if no plugin changed, once the user confirms', async () => {
    confirm.mockResolvedValue(true)

    await confirmAndWrite('./plugins.json', next, noChanges, { retargetedFrom: '1.21.1', writeChangelog: true })

    expect(writePlugins).toHaveBeenCalledWith(next, './plugins.json')
    expect(installPlugins).toHaveBeenCalledOnce()
  })

  it('reports no updates available and writes nothing when nothing changed', async () => {
    await confirmAndWrite('./plugins.json', next, noChanges, { writeChangelog: true })

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('No updates available')
    expect(confirm).not.toHaveBeenCalled()
    expect(writePlugins).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })

  it('writes nothing when the user declines to continue', async () => {
    confirm.mockResolvedValue(false)

    await confirmAndWrite('./plugins.json', next, oneChange, { writeChangelog: true })

    expect(writePlugins).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(installPlugins).not.toHaveBeenCalled()
  })

  it('writes changelog.md only when writeChangelog is set', async () => {
    confirm.mockResolvedValue(true)

    await confirmAndWrite('./plugins.json', next, oneChange, { writeChangelog: false })
    expect(writeFile).not.toHaveBeenCalled()

    await confirmAndWrite('./plugins.json', next, oneChange, { writeChangelog: true })
    expect(writeFile).toHaveBeenCalledWith('changelog.md', '# Changelog\n\n## vault', 'utf-8')
  })
})
