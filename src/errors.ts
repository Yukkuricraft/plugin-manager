import type { Loader } from './sources/modrinth/loaders.js'

export class ValidationError extends Error {}

export class SanityCheckError extends Error {}

export class UserError extends Error {}

export class RequestError extends Error {}

export class RatelimitError extends Error {}

export class MissingDataError extends Error {}

/**
 * Thrown by getPluginVersion when no version of a project is left after filtering by loader, Minecraft
 * version and featured status. update catches this so it can offer to keep the plugin at its current
 * build instead of failing outright.
 */
export class NoCompatibleVersionError extends UserError {
  readonly projectId: string
  // Called projectName rather than name, since name would shadow Error.prototype.name
  readonly projectName: string
  readonly loader: Loader
  readonly gameVersion: string | undefined
  readonly featured: boolean

  constructor(details: {
    projectId: string
    projectName: string
    loader: Loader
    gameVersion?: string
    featured?: boolean
  }) {
    const gameVersion = details.gameVersion ? ` supporting Minecraft ${details.gameVersion}` : ''
    const featured = details.featured ? ', among featured versions only' : ''
    super(`No ${details.loader} versions found for plugin ${details.projectName}${gameVersion}${featured}`)
    this.projectId = details.projectId
    this.projectName = details.projectName
    this.loader = details.loader
    this.gameVersion = details.gameVersion
    this.featured = details.featured ?? false
  }
}
