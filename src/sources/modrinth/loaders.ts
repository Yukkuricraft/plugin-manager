/**
 * The loader `init` suggests as its default answer when asking which loader the server runs. Nothing
 * resolves against it: every command resolves against the loader recorded in plugins.json, or an override
 * on the specific plugin.
 */
export const defaultLoader: Loader = 'paper'

/**
 * For each loader Modrinth tags plugins with, the loader it inherits plugins from, or null if it
 * runs only its own.
 *
 * This is compatibility ancestry, not code ancestry. Folia is a fork of Paper and Velocity
 * succeeded Waterfall, but neither runs the plugins of what it descends from, so both are roots
 * here.
 */
const loaderParent = {
  bukkit: null,
  spigot: 'bukkit',
  paper: 'spigot',
  purpur: 'paper',
  folia: null,
  bungeecord: null,
  waterfall: 'bungeecord',
  velocity: null,
  sponge: null,
  geyser: null,
} as const satisfies Record<string, string | null>

export type Loader = keyof typeof loaderParent

export const allLoaders = Object.keys(loaderParent) as Loader[]

interface LoaderTagged {
  loaders?: string[] | null
}

/**
 * The loaders a version can be tagged with and still run on `loader`, most preferred first.
 * Paper gives ["paper", "spigot", "bukkit"], velocity gives just ["velocity"].
 */
export function loaderFallbacks(loader: Loader): Loader[] {
  const fallbacks: Loader[] = []
  let current: Loader | null = loader
  while (current !== null) {
    fallbacks.push(current)
    current = loaderParent[current]
  }
  return fallbacks
}

/**
 * Narrows `versions` to those built for `loader`, preferring an exact tag over one inherited from
 * further up the chain. A plugin tagged only "bukkit" still runs on Paper, so falling back beats
 * rejecting it, but a version tagged for the loader itself always wins over one that is not.
 *
 * Returns every version at the best available tier, or nothing if none are compatible at all.
 */
export function loaderCandidates<V extends LoaderTagged>(versions: V[], loader: Loader): V[] {
  for (const fallback of loaderFallbacks(loader)) {
    const matching = versions.filter((v) => v.loaders?.includes(fallback))
    if (matching.length > 0) return matching
  }
  return []
}

/**
 * Of versions that are otherwise equivalent, the ones tagged with the fewest loaders.
 *
 * Projects that ship one jar per platform publish them as separate versions sharing a version
 * number, and tag the platform specific jar most narrowly: FastAsyncWorldEdit 2.15.1 is three
 * versions, of which the Paper jar is the one tagged ["paper"] rather than ["paper", "spigot"].
 */
export function mostLoaderSpecific<V extends LoaderTagged>(versions: V[]): V[] {
  if (versions.length === 0) return []
  const fewest = Math.min(...versions.map((v) => v.loaders?.length ?? 0))
  return versions.filter((v) => (v.loaders?.length ?? 0) === fewest)
}
