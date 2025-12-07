import * as prompts from '@inquirer/prompts'
import fs from 'fs/promises'

import { loadPlugins, Plugins, writePlugins } from '../pluginList.js'
import { allPluginSources } from '../sources/pluginSource.js'
import { output } from '../utils/output.js'
import installPlugins from './installPlugins.js'

export default async function updatePlugins(gameVersion?: string, featured?: boolean) {
  const existingPlugins = await loadPlugins()

  const newPlugins: Plugins = {
    added: {},
    all: {
      modrinth: {},
      url: {},
    },
  }

  const changelogs = ['# Changelog']
  const removedPlugins: string[] = []
  const addedPlugins: string[] = []
  const changesVersions: { identifier: string; oldVersion: string; newVersion: string }[] = []
  for (const pluginSource of allPluginSources) {
    const { changelog, removed, added, changed } = await pluginSource.update(
      existingPlugins,
      newPlugins,
      gameVersion,
      featured,
    )

    if (changelog.length > 0) changelogs.push(changelog)

    removedPlugins.push(...removed)
    addedPlugins.push(...added)
    changesVersions.push(...changed)
  }

  output.header('Changes')

  if (removedPlugins.length > 0) {
    output.minus(`Removed plugins (${removedPlugins.length}):`)
    for (const p of removedPlugins) {
      console.log(`  ${output.dim('•')} ${output.pluginName(p)}`)
    }
    output.blank()
  }

  if (addedPlugins.length > 0) {
    output.plus(`Added plugins (${addedPlugins.length}):`)
    for (const p of addedPlugins) {
      console.log(`  ${output.dim('•')} ${output.pluginName(p)}`)
    }
    output.blank()
  }

  if (changesVersions.length > 0) {
    output.update(`Version changes (${changesVersions.length}):`)
    for (const p of changesVersions) {
      console.log(
        `  ${output.dim('•')} ${output.highlight(p.identifier)}: ${output.version(p.oldVersion)} → ${output.version(p.newVersion)}`,
      )
    }
    output.blank()
  }

  if (removedPlugins.length === 0 && addedPlugins.length === 0 && changesVersions.length === 0) {
    output.info('No updates available')
    return
  }

  const contine = await prompts.confirm({
    message: 'Continue?',
  })
  if (!contine) return
  await writePlugins(newPlugins)
  await fs.writeFile('changelog.md', changelogs.join('\n\n'), 'utf-8')

  await installPlugins()
}
