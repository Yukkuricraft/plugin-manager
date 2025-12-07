/* eslint-disable @typescript-eslint/require-await */
import { PluginSource } from '../pluginSource.js'
import { AllPlugins, Plugin, Plugins, UrlPlugin } from '../../pluginList.js'
import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import chalk from 'chalk'
import contentDisposition from 'content-disposition'

const urlSource: PluginSource<UrlPlugin> = {
  prefix: 'url',
  findPlugin(query: string, plugins: AllPlugins): { plugin: UrlPlugin; id: string } | null {
    const plugin = plugins.url[query]
    return plugin ? { plugin, id: query } : null
  },
  search(): Promise<void> {
    throw new Error('Search is not possible for URLs')
  },
  async viewPlugins(plugins: { plugin: UrlPlugin; id: string }[]): Promise<void> {
    for (const { plugin, id } of plugins) {
      console.log(`${id}: ${plugin.url}`)
    }
  },
  async addPlugin(plugins: Plugins, pluginIndicator: string): Promise<void> {
    const parts = pluginIndicator.split('@')
    if (parts.length !== 2) throw new Error('Invalid URL format')
    const [id, url] = parts
    plugins.added[`url:${id}`] = url
    plugins.all.url[id] = {
      source: 'url' as const,
      url,
    }
  },
  async update(): Promise<{
    changelog: string
    removed: string[]
    added: string[]
    changed: { identifier: string; oldVersion: string; newVersion: string }[]
  }> {
    return {
      changelog: '',
      removed: [],
      added: [],
      changed: [],
    }
  },
  async install(plugins: AllPlugins): Promise<void> {
    await Promise.all(
      Object.entries(plugins.url).map(async ([id, plugin]) => {
        const url = plugin.url
        const res = await fetch(url)
        if (!res.ok || !res.body) throw new Error(`Failed to download ${url}`)
        const filenameHeader = res.headers.get('Content-Disposition')
        const contentDispositionData = filenameHeader === null ? null : contentDisposition.parse(filenameHeader)
        const filename = contentDispositionData?.parameters?.filename ?? id

        const fileStream = createWriteStream(`./managedPlugins/${filename}`)
        await finished(Readable.fromWeb(res.body as ReadableStream).pipe(fileStream))
        console.log(chalk.green(`Downloaded ./managedPlugins/${filename}`))
      }),
    )
  },
  removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
    for (const { id } of allToRemove) {
      delete plugins.all.url[id]
    }
  },
}

export default urlSource
