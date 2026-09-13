import { type PluginOverrides, type ServerConfig } from './pluginList.js'
import { type Loader } from './sources/modrinth/loaders.js'

/**
 * Works out which loader and Minecraft version each plugin is resolved against, from the configuration in
 * plugins.json, the plugin's recorded overrides and any --loader/--game-version flags, and which overrides
 * to record as a result.
 */

export interface ResolutionFlags {
  loader?: Loader
  gameVersion?: string
}

/** Represents one field where the value used for the plugin differs from the server configuration. */
export interface Deviation {
  field: 'loader' | 'gameVersion'
  configValue: string
  usedValue: string
}

/**
 * The loader and Minecraft version to resolve one plugin against, and each field where that differs from
 * the server configuration. The Minecraft version is always the configured one or a --game-version flag,
 * never the plugin's recorded Minecraft version override, so the plugin may have no build for it; the
 * caller deals with that (update offers to keep the plugin, add fails).
 */
export interface ResolvedTarget {
  loader: Loader
  gameVersion: string
  deviations: Deviation[]
}

/**
 * Works out the loader and Minecraft version to resolve a plugin against, given the server
 * configuration, the overrides already stored for that plugin (if any), and any flags passed on
 * the command line for this run.
 *
 * For the loader, a flag wins, then the plugin's own override, then the configuration. A loader
 * override is sticky: it keeps applying on every later add and update of that plugin until a
 * --loader flag replaces it. For the Minecraft version, a flag wins, then the configuration; the
 * plugin's own gameVersion override is never consulted here, because it only records that the
 * plugin is lagging behind the configuration, not what it should resolve against next.
 *
 * The returned deviations list every field where the value used differs from the configuration, so
 * callers can tell what to store as overrides or report to the user.
 */
export function resolveTarget(
  config: ServerConfig,
  overrides: PluginOverrides | undefined,
  flags: ResolutionFlags,
): ResolvedTarget {
  const loader = flags.loader ?? overrides?.loader ?? config.loader
  const gameVersion = flags.gameVersion ?? config.gameVersion

  const deviations: Deviation[] = []
  if (loader !== config.loader) deviations.push({ field: 'loader', configValue: config.loader, usedValue: loader })
  if (gameVersion !== config.gameVersion) {
    deviations.push({ field: 'gameVersion', configValue: config.gameVersion, usedValue: gameVersion })
  }
  return { loader, gameVersion, deviations }
}

/**
 * Turns a resolved target into the overrides to store for a plugin: one entry per field where the
 * used value differed from the configuration. Returns undefined when there were no deviations.
 */
export function overridesFor(resolved: ResolvedTarget): PluginOverrides | undefined {
  const overrides: PluginOverrides = {}
  for (const deviation of resolved.deviations) {
    if (deviation.field === 'loader') overrides.loader = resolved.loader
    else overrides.gameVersion = resolved.gameVersion
  }
  return compact(overrides)
}

/**
 * Records that a plugin is being held at `gameVersion` instead of the configured one, keeping any
 * existing loader override in place. Used by update when a plugin has no build for the new Minecraft
 * version and the user keeps its current one.
 */
export function grantGameVersionOverride(existing: PluginOverrides | undefined, gameVersion: string): PluginOverrides {
  return { ...existing, gameVersion }
}

/**
 * Removes a plugin's game version override, keeping any loader override in place. Used by `run-cli update`
 * once a plugin has been brought back up to the configured Minecraft version. Returns undefined
 * when there is nothing left to store.
 */
export function clearGameVersionOverride(existing: PluginOverrides | undefined): PluginOverrides | undefined {
  return existing?.loader === undefined ? undefined : { loader: existing.loader }
}

/**
 * Compares two overrides field by field, treating undefined and {} as equal.
 */
export function sameOverrides(a: PluginOverrides | undefined, b: PluginOverrides | undefined): boolean {
  return a?.loader === b?.loader && a?.gameVersion === b?.gameVersion
}

/**
 * Works out what search should filter by: the loader and Minecraft version to use, starting from
 * the configuration and letting flags override either for this run. Passing anyGameVersion drops
 * the Minecraft version filter entirely, returning it as undefined. There is no plugin here, so
 * unlike resolveTarget there is no stored override to fall back on.
 */
export function searchTarget(
  config: ServerConfig,
  flags: ResolutionFlags & { anyGameVersion?: boolean },
): { loader: Loader; gameVersion?: string } {
  const { loader, gameVersion } = resolveTarget(config, undefined, flags)
  return { loader, gameVersion: flags.anyGameVersion ? undefined : gameVersion }
}

/** Turns an overrides object with no fields set into undefined, leaving one with any field set as is. */
function compact(overrides: PluginOverrides): PluginOverrides | undefined {
  return overrides.loader === undefined && overrides.gameVersion === undefined ? undefined : overrides
}
