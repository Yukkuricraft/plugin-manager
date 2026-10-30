import { loadPlugins, type Plugins } from '../pluginList.js'
import update from '../sources/url/update.js'
import { confirmAndWrite } from './updateCommon.js'

export default async function updateUrl(pluginsPath: string, ids: string[]): Promise<void> {
  const existing = await loadPlugins(pluginsPath)
  const next: Plugins = {
    ...existing,
    added: Object.fromEntries(Object.entries(existing.added).filter(([key]) => !key.startsWith('url:'))),
    all: { ...existing.all, url: {} },
  }

  const result = await update(existing, next, ids)
  await confirmAndWrite(pluginsPath, next, result, { writeChangelog: false })
}
