import { type ModrinthPlugin, type SubstituteRule, type UrlPlugin } from '../src/pluginList.js'

/** A lock file entry for tests, with every field defaulted so a test only states what it cares about */
export function modrinthEntry(fields: Partial<ModrinthPlugin> = {}): ModrinthPlugin {
  return {
    source: 'modrinth',
    slug: 'plugin',
    version: '1.0.0',
    versionId: 'version-id',
    sha512: null,
    sha1: null,
    size: 1,
    filename: 'plugin.jar',
    publishedAt: '2025-01-01T00:00:00Z',
    dependedOnBy: new Set(),
    ...fields,
  }
}

/** A url lock file entry for tests, with every field defaulted so a test only states what it cares about */
export function urlEntry(fields: Partial<UrlPlugin> = {}): UrlPlugin {
  return {
    source: 'url',
    url: 'https://files.example/plugin.jar',
    version: '1.0.0',
    filename: 'plugin.jar',
    sha512: 'sha512-plugin',
    size: 1,
    pinnedAt: '2025-01-01T00:00:00Z',
    ...fields,
  }
}

/** A substitution rule for tests, defaulting to worldedit replaced by the fastasyncworldedit Modrinth project */
export function substituteRule(fields: Partial<SubstituteRule> = {}): SubstituteRule {
  return {
    slug: 'worldedit',
    substitute: 'fawe',
    substituteSlug: 'fastasyncworldedit',
    substituteSource: 'modrinth',
    ...fields,
  }
}
