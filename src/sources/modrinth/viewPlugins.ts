import { ModrinthPlugin } from '../../pluginList.js'
import { output } from '../../utils/output.js'
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

    output.pluginCard({
      title: project.title,
      slug: project.slug,
      description: project.description,
      downloads: project.downloads,
      mcVersions: project.game_versions,
      issuesUrl: project.issues_url ?? undefined,
      sourceUrl: project.source_url ?? undefined,
      wikiUrl: project.wiki_url ?? undefined,
      discordUrl: project.discord_url ?? undefined,
    })

    if (!last || i !== plugins.length - 2) output.blank()
  }
}
