import client from './client.js'
import { output } from '../../utils/output.js'
import { RequestError } from '../../errors.js'

export default async function search(query: string) {
  const res = await client.GET('/search', {
    params: {
      query: {
        query,
        facets: JSON.stringify([['project_type:plugin']]),
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
