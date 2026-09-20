import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HashMismatchError, ValidationError } from '../../../src/errors.js'
import { type AllPlugins } from '../../../src/pluginList.js'
import { urlEntry } from '../../testFixtures.js'
import { hostHeaders } from '../../../src/sources/url/hostHeaders.js'
import install from '../../../src/sources/url/install.js'

const { downloadFile } = vi.hoisted(() => ({ downloadFile: vi.fn() }))
// fileHash stays real, so the files written below are really hashed
vi.mock('../../../src/utils/files.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  downloadFile,
}))

function sha512(contents: string) {
  return createHash('sha512').update(contents).digest('hex')
}

const vault = urlEntry({ url: 'https://files.example/Vault.jar', filename: 'Vault.jar', sha512: sha512('vault') })

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
})
