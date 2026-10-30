import * as prompts from '@inquirer/prompts'
import fs from 'fs/promises'

import { type Plugins, writePlugins } from '../pluginList.js'
import { type UpdateResult } from '../sources/pluginSource.js'
import { output } from '../utils/output.js'
import installPlugins from './installPlugins.js'

/**
 * Shows what an update changed and, once the user confirms, writes `next` to `pluginsPath` and installs it.
 * `retargetedFrom` is the Minecraft version plugins.json had before `next` moved it.
 */
export async function confirmAndWrite(
  pluginsPath: string,
  next: Plugins,
  result: UpdateResult,
  opts: { retargetedFrom?: string; writeChangelog: boolean },
): Promise<void> {
  const { removed, added, changed, overrides } = result

  output.header('Changes')

  const { retargetedFrom } = opts
  const retargeted = retargetedFrom !== undefined
  if (retargeted) {
    output.update(`Minecraft version: ${output.version(retargetedFrom)} → ${output.version(next.config.gameVersion)}`)
    output.blank()
  }

  if (removed.length > 0) {
    output.minus(`Removed plugins (${removed.length}):`)
    for (const p of removed) {
      console.log(`  ${output.dim('•')} ${output.pluginName(p)}`)
    }
    output.blank()
  }

  if (added.length > 0) {
    output.plus(`Added plugins (${added.length}):`)
    for (const p of added) {
      console.log(`  ${output.dim('•')} ${output.pluginName(p)}`)
    }
    output.blank()
  }

  if (changed.length > 0) {
    output.update(`Version changes (${changed.length}):`)
    for (const p of changed) {
      console.log(
        `  ${output.dim('•')} ${output.highlight(p.identifier)}: ${output.version(p.oldVersion)} → ${output.version(p.newVersion)}`,
      )
    }
    output.blank()
  }

  if (overrides.length > 0) {
    output.warning(`Overrides (${overrides.length}):`)
    for (const o of overrides) {
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
    !retargeted && removed.length === 0 && added.length === 0 && changed.length === 0 && overrides.length === 0
  if (nothingChanged) {
    output.info('No updates available')
    return
  }

  const accept = await prompts.confirm({
    message: 'Continue?',
  })
  if (!accept) return
  await writePlugins(next, pluginsPath)
  if (opts.writeChangelog) {
    await fs.writeFile('changelog.md', ['# Changelog', result.changelog].filter(Boolean).join('\n\n'), 'utf-8')
  }

  await installPlugins(pluginsPath)
}
