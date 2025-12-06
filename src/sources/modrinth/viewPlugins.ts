import chalk from 'chalk'

import { ModrinthPlugin } from '../../pluginList.js'
import client from './client.js'

export default async function viewPlugins(
  plugins: { plugin: ModrinthPlugin; id: string }[],
  last: boolean,
): Promise<void> {
  const pluginIds: string[] = plugins.map((p) => p.id)

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
    if (!last || i !== plugins.length - 2) console.log()
  }
}
