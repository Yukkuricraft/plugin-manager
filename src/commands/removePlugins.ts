import { loadPlugins, writePlugins, type Plugin } from '../pluginList.js'
import installPlugins from './installPlugins.js'

function categorizeOne(p: Plugin, toRemoveIds: Set<string>, seen: Set<string>): 'clear' | 'remove' | 'keep' {
  if (p.dependedOnBy.size === 0) return 'clear'

  let everyDependantRemoved = true
  let someDependantRemoved = false
  for (const dependant of p.dependedOnBy) {
    seen.add(dependant)

    const dependantRemoved = toRemoveIds.has(dependant)
    if (dependantRemoved) {
      someDependantRemoved = true
    } else {
      everyDependantRemoved = false
    }
  }

  // If every dependant was removed, skip the extra work
  if (!everyDependantRemoved && someDependantRemoved) {
    p.dependedOnBy = p.dependedOnBy.difference(toRemoveIds)
  }

  if (everyDependantRemoved) return 'remove'
  else return 'keep'
}

function removePluginsImpl(toRemoveIds: Set<string>, plugins: Plugin[]) {
  const clear = []
  while (toRemoveIds.size > 0) {
    const remove = []
    const keep = []

    const seen = new Set<string>()
    for (const plugin of plugins) {
      if (toRemoveIds.has(plugin.id) && plugin.dependedOnBy.size === 0) continue

      const action = categorizeOne(plugin, toRemoveIds, seen)
      switch (action) {
        case 'clear':
          clear.push(plugin)
          break
        case 'remove':
          remove.push(plugin.id)
          break
        case 'keep':
          keep.push(plugin)
          break
        default:
          throw new Error(`Unknown action ${action satisfies never}`)
      }
    }

    toRemoveIds = toRemoveIds.intersection(seen)
    remove.forEach((id) => toRemoveIds.add(id))

    plugins = keep
  }

  return [...clear, plugins]
}

export default async function removePlugins(pluginsToRemove: string[]) {
  const plugins = await loadPlugins()
  const toRemoveIds = plugins.all.filter((p) => p.slug && pluginsToRemove.includes(p.slug)).map((p) => p.id)

  pluginsToRemove.forEach((p) => delete plugins.added[p])
  plugins.all = removePluginsImpl(new Set(toRemoveIds), plugins.all).flat()

  await writePlugins(plugins)
  await installPlugins()
}
