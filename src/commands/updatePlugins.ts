import * as prompts from '@inquirer/prompts'
import chalk from 'chalk'
import fs from 'fs/promises'

import { loadPlugins, Plugins, writePlugins } from '../pluginList.js'
import { allPluginSources } from '../sources/pluginSource.js'
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

  let summary = ''
  if (removedPlugins.length > 0) {
    summary += `Removed plugins:
${removedPlugins.map((p) => `  ${chalk.red(p)}`).join('\n')}`
  }

  if (addedPlugins.length > 0) {
    summary += `Added plugins:
${addedPlugins.map((p) => `  ${chalk.green(p)}`).join('\n')}`
  }

  if (changesVersions.length > 0) {
    summary += `Changes:
${changesVersions.map((p) => `  ${chalk.yellow(`${p.identifier}: ${p.oldVersion} -> ${p.newVersion}'`)}`).join('\n')}`
  }

  console.log(summary)

  const contine = await prompts.confirm({
    message: 'Continue?',
  })
  if (!contine) return
  await writePlugins(newPlugins)
  await fs.writeFile('changelog.md', changelogs.join('\n\n'), 'utf-8')

  await installPlugins()
}
