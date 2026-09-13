import { type ModrinthPlugin } from './pluginList.js'

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
