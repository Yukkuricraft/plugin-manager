import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserError, HashMismatchError, ValidationError } from '../../../src/errors.js'
import { type AllPlugins } from '../../../src/pluginList.js'
import { urlEntry } from '../../testFixtures.js'
import { hostHeaders } from '../../../src/sources/url/hostHeaders.js'
import { listFiles } from '../../../src/utils/files.js'
import install from '../../../src/sources/url/install.js'

const { downloadFile } = vi.hoisted(() => ({ downloadFile: vi.fn() }))
// fileHash and listFiles stay real, so the files written below are really hashed and walked
vi.mock('../../../src/utils/files.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  downloadFile,
}))

function sha512(contents: string) {
  return createHash('sha512').update(contents).digest('hex')
}

const vault = urlEntry({ url: 'https://files.example/Vault.jar', filename: 'Vault.jar', sha512: sha512('vault') })
const essentials = urlEntry({
  url: 'https://files.example/Essentials.jar',
  filename: 'Essentials.jar',
  sha512: sha512('essentials'),
  overrides: { path: 'PlaceholderAPI/expansions' },
})

function plugins(url: AllPlugins['url']): AllPlugins {
  return { modrinth: {}, url }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'url-install-'))
  downloadFile.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('url install', () => {
  it('keeps a file with the pinned name and hash, without downloading it', async () => {
    await writeFile(path.join(dir, 'Vault.jar'), 'vault')

    await install(plugins({ vault }), dir)

    expect(downloadFile).not.toHaveBeenCalled()
    expect(await readdir(dir)).toEqual(['Vault.jar'])
  })

  it('deletes a file no entry pins, and a pinned name with the wrong contents, then downloads', async () => {
    await writeFile(path.join(dir, 'Stray.jar'), 'stray')
    await writeFile(path.join(dir, 'Vault.jar'), 'not vault')

    await install(plugins({ vault }), dir)

    expect(await readdir(dir)).toEqual([])
    expect(downloadFile).toHaveBeenCalledWith(vault.url, dir, {
      id: 'vault',
      filename: 'Vault.jar',
      sha512: vault.sha512,
      hosts: hostHeaders,
    })
  })

  it('says the file behind the URL changed when the download fails its hash check', async () => {
    downloadFile.mockRejectedValue(new HashMismatchError('SHA512 hash mismatch for Vault.jar'))

    const error = await install(plugins({ vault }), dir).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ValidationError)
    expect((error as Error).message).toContain('vault: the file at its URL has changed since it was added')
  })

  it('passes other download errors through unchanged', async () => {
    const failure = new Error('network down')
    downloadFile.mockRejectedValue(failure)

    await expect(install(plugins({ vault }), dir)).rejects.toBe(failure)
  })

  it('downloads an overridden plugin into its directory, creating it', async () => {
    await install(plugins({ essentials }), dir)

    expect(downloadFile).toHaveBeenCalledWith(essentials.url, path.join(dir, 'PlaceholderAPI', 'expansions'), {
      id: 'essentials',
      filename: 'Essentials.jar',
      sha512: essentials.sha512,
      hosts: hostHeaders,
    })
    expect(await readdir(path.join(dir, 'PlaceholderAPI', 'expansions'))).toEqual([])
  })

  it('keeps a staged file already in the overridden directory', async () => {
    await mkdir(path.join(dir, 'PlaceholderAPI', 'expansions'), { recursive: true })
    await writeFile(path.join(dir, 'PlaceholderAPI', 'expansions', 'Essentials.jar'), 'essentials')

    await install(plugins({ essentials }), dir)

    expect(downloadFile).not.toHaveBeenCalled()
    expect(await listFiles(dir)).toEqual(['PlaceholderAPI/expansions/Essentials.jar'])
  })

  it('deletes a staged file whose entry lost its override, and downloads it to the root', async () => {
    await mkdir(path.join(dir, 'PlaceholderAPI', 'expansions'), { recursive: true })
    await writeFile(path.join(dir, 'PlaceholderAPI', 'expansions', 'Essentials.jar'), 'essentials')
    const moved = urlEntry({ url: essentials.url, filename: 'Essentials.jar', sha512: essentials.sha512 })

    await install(plugins({ essentials: moved }), dir)

    expect(await listFiles(dir)).toEqual([])
    expect(downloadFile).toHaveBeenCalledWith(moved.url, dir, expect.anything())
  })

  it('removes a directory left empty once its file is gone', async () => {
    await mkdir(path.join(dir, 'PlaceholderAPI', 'expansions'), { recursive: true })
    await writeFile(path.join(dir, 'PlaceholderAPI', 'expansions', 'Stray.jar'), 'stray')

    await install(plugins({}), dir)

    expect(await readdir(dir)).toEqual([])
  })

  it('keeps a file at the root with the same name as one in a subdirectory', async () => {
    await writeFile(path.join(dir, 'Essentials.jar'), 'root essentials')
    await mkdir(path.join(dir, 'PlaceholderAPI', 'expansions'), { recursive: true })
    await writeFile(path.join(dir, 'PlaceholderAPI', 'expansions', 'Essentials.jar'), 'essentials')
    const root = urlEntry({
      url: 'https://files.example/root/Essentials.jar',
      filename: 'Essentials.jar',
      sha512: sha512('root essentials'),
    })

    await install(plugins({ essentials, root }), dir)

    expect(downloadFile).not.toHaveBeenCalled()
    expect(await listFiles(dir)).toEqual(['Essentials.jar', 'PlaceholderAPI/expansions/Essentials.jar'])
  })

  it('refuses two entries installed to the same path, before deleting anything', async () => {
    await writeFile(path.join(dir, 'Stray.jar'), 'stray')
    const twin = urlEntry({ url: 'https://files.example/other/Vault.jar', filename: 'Vault.jar' })

    await expect(install(plugins({ vault, twin }), dir)).rejects.toThrow(UserError)
    await expect(install(plugins({ vault, twin }), dir)).rejects.toThrow('Vault.jar')

    expect(await listFiles(dir)).toEqual(['Stray.jar'])
  })
})
