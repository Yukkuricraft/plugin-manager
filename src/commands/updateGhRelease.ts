import { loadPlugins, type Plugins } from '../pluginList.js'
import update from '../sources/ghRelease/update.js'
import { confirmAndWrite } from './updateCommon.js'

export default async function updateGhRelease(pluginsPath: string, ids: string[]): Promise<void> {
  const existing = await loadPlugins(pluginsPath)
  const next: Plugins = {
    ...existing,
    added: { ...existing.added },
    all: { ...existing.all, 'gh-release': { ...existing.all['gh-release'] } },
  }

  const result = await update(next, ids)
  await confirmAndWrite(pluginsPath, next, result, { writeChangelog: false })
}
