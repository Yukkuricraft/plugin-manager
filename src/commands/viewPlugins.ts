import { loadPlugins } from '../pluginList.js'
import client from '../client.js'
import chalk from 'chalk'

export default async function viewPlugins(plugins: string[]) {
  const pluginsMap = await loadPlugins()

  const correspondingId = plugins.map((p) => [p, pluginsMap.all.find((ap) => ap.slug === p)?.id])

  if (!correspondingId.every(([, id]) => id !== undefined)) {
    const notFound = plugins.filter(([, id]) => id === undefined).map(([p]) => p)
    throw new Error(`Plugins ${notFound.join(', ')} not found`)
  }
  const pluginIds: string[] = correspondingId.map(([, id]) => id).filter((id) => id !== undefined)

  const res = await client.GET('/projects', {
    params: {
      query: {
        ids: JSON.stringify(pluginIds),
      },
    },
  })
  if (!res.data) {
    throw new Error('Failed to get projects', { cause: res.error })
  }

  for (let i = 0; i < res.data.length; i++) {
    const project = res.data[i]

    console.log(
      chalk.blue(`${project.title}
  Slug: ${project.slug}
  Downloads: ${project.downloads}
  Minecraft versions: ${project.game_versions?.join(',')}
  Description: ${project.description}
  Issues URL: ${project.issues_url}
  Source URL: ${project.source_url}
  Wiki URL: ${project.wiki_url}
  Discord URL: ${project.discord_url}`),
    )
    if (i !== plugins.length - 2) console.log()
  }
}
