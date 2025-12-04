import client from '../client.js'
import chalk from 'chalk'

export default async function searchPlugins(query: string) {
  const res = await client.GET('/search', {
    params: {
      query: {
        query,
        facets: JSON.stringify([['project_type:plugin']]),
      },
    },
  })
  if (!res.data) {
    throw new Error('Failed to search plugins', { cause: res.error })
  }
  if (!res.data.hits.length) {
    console.log(chalk.red('No projects found'))
  } else {
    for (let i = 0; i < res.data.hits.length; i++) {
      const project = res.data.hits[i]

      console.log(`${chalk.green(project.title)}
  Slug: ${chalk.blue(project.slug)}
  Author: ${chalk.blue(project.author)}
  Downloads: ${chalk.blue(project.downloads)}
  Minecraft versions: ${chalk.blue(project.versions.join(','))}
  Description: ${chalk.blue(project.description)}`)
      if (i !== res.data.hits.length - 2) console.log()
    }
  }
}
