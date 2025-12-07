import { AllModrinthPlugins, ModrinthPlugin, Plugin, Plugins } from '../../pluginList.js'
import { SanityCheckError } from '../../errors.js'

export default function removePlugin(plugins: Plugins, allToRemove: { plugin: Plugin; id: string }[]) {
  function categorizeOne(p: ModrinthPlugin, toRemoveIds: Set<string>, seen: Set<string>): 'clear' | 'remove' | 'keep' {
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

    if (someDependantRemoved) {
      p.dependedOnBy = p.dependedOnBy.difference(toRemoveIds)
    }

    if (everyDependantRemoved && !plugins.added[`modrinth:${p.slug}`]) return 'remove'
    else return 'keep'
  }

  function removePluginsImpl(toRemoveIds: Set<string>, plugins: AllModrinthPlugins): AllModrinthPlugins {
    const clear: AllModrinthPlugins = {}
    while (toRemoveIds.size > 0) {
      const remove = []
      const keep: AllModrinthPlugins = {}

      const seen = new Set<string>()
      for (const id in plugins) {
        const plugin = plugins[id]
        if (toRemoveIds.has(id) && plugin.dependedOnBy.size === 0) continue

        const action = categorizeOne(plugin, toRemoveIds, seen)
        switch (action) {
          case 'clear':
            clear[id] = plugin
            break
          case 'remove':
            remove.push(id)
            break
          case 'keep':
            keep[id] = plugin
            break
          default:
            throw new SanityCheckError(`Unknown action ${action satisfies never}`)
        }
      }

      toRemoveIds = toRemoveIds.intersection(seen)
      remove.forEach((id) => toRemoveIds.add(id))

      plugins = keep
    }

    return { ...clear, ...plugins }
  }

  const toRemoveIds = new Set<string>()

  allToRemove.forEach(({ plugin, id }) => {
    if (plugin.source !== 'modrinth') return
    toRemoveIds.add(id)
  })

  plugins.all.modrinth = removePluginsImpl(toRemoveIds, plugins.all.modrinth)
}
