import * as prompts from '@inquirer/prompts'
import fs from 'fs/promises'

import { loadPlugins, type Plugins, writePlugins } from '../pluginList.js'
import { chooseGameVersion } from '../sources/modrinth/gameVersions.js'
import { allPluginSources, type OverrideChange } from '../sources/pluginSource.js'
import { output } from '../utils/output.js'
import installPlugins from './installPlugins.js'

export default async function updatePlugins(flags: { gameVersion?: string; featured?: boolean }) {
  const existingPlugins = await loadPlugins()
  const currentGameVersion = existingPlugins.config.gameVersion
  const gameVersion = await chooseGameVersion(
    flags.gameVersion,
    'Which Minecraft version should plugins be updated for?',
    currentGameVersion,
  )

  // Every source fills this in against the new Minecraft version, and it is written once, after all of them
  // finish and the user confirms. So plugins.json never records the new version while a plugin's build was
  // resolved against another one, unless that plugin carries an override saying so.
  const newPlugins: Plugins = {
    version: 2,
    config: { ...existingPlugins.config, gameVersion },
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
  const overrideChanges: OverrideChange[] = []
  for (const pluginSource of allPluginSources) {
    const { changelog, removed, added, changed, overrides } = await pluginSource.update(existingPlugins, newPlugins, {
      gameVersion,
      featured: flags.featured,
    })

    if (changelog.length > 0) changelogs.push(changelog)

    removedPlugins.push(...removed)
    addedPlugins.push(...added)
    changesVersions.push(...changed)
    overrideChanges.push(...overrides)
  }

  output.header('Changes')

  const retargeted = gameVersion !== currentGameVersion
  if (retargeted) {
    output.update(`Minecraft version: ${output.version(currentGameVersion)} → ${output.version(gameVersion)}`)
    output.blank()
  }

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

  if (overrideChanges.length > 0) {
    output.warning(`Overrides (${overrideChanges.length}):`)
    for (const o of overrideChanges) {
      const change =
        o.change === 'granted'
          ? `held back at Minecraft ${o.gameVersion}`
          : `no longer held back at Minecraft ${o.gameVersion}`
      console.log(`  ${output.dim('•')} ${output.highlight(o.identifier)}: ${change}`)
    }
    output.blank()
  }

  // Retargeting, or an override changing, counts as a change even if every plugin keeps its build.
  const nothingChanged =
    !retargeted &&
    removedPlugins.length === 0 &&
    addedPlugins.length === 0 &&
    changesVersions.length === 0 &&
    overrideChanges.length === 0
  if (nothingChanged) {
    output.info('No updates available')
    return
  }

  const accept = await prompts.confirm({
    message: 'Continue?',
  })
  if (!accept) return
  await writePlugins(newPlugins)
  await fs.writeFile('changelog.md', changelogs.join('\n\n'), 'utf-8')

  await installPlugins()
}
