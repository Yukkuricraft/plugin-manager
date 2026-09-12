import client from './client.js'
import { type Loader, loaderFallbacks } from './loaders.js'
import { output } from '../../utils/output.js'
import { RequestError } from '../../errors.js'

export default async function search(query: string, loader: Loader, gameVersion?: string) {
  // Facets in the same inner array are ORed and the arrays themselves ANDed. The loader matches anything that would
  // still run on it, the same way versions are resolved when adding a plugin
  const facets = [['project_type:plugin'], loaderFallbacks(loader).map((l) => `categories:${l}`)]
  if (gameVersion) facets.push([`versions:${gameVersion}`])

  const res = await client.GET('/search', {
    params: {
      query: {
        query,
        facets: JSON.stringify(facets),
      },
    },
  })
  if (!res.data) {
    throw new RequestError('Failed to search plugins', { cause: res.error })
  }
  if (!res.data.hits.length) {
    output.error('No projects found')
  } else {
    for (const project of res.data.hits) {
      output.pluginCard({
        title: project.title,
        slug: project.slug,
        mcVersions: project.versions,
        description: project.description,
        author: project.author,
        downloads: project.downloads,
        categories: project.categories,
      })
    }
  }
}
