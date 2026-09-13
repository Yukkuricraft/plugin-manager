import chalk from 'chalk'
import { type PluginOverrides } from '../pluginList.js'
import { SanityCheckError } from '../errors.js'

export const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  download: '⬇',
  update: '↑',
  plugin: '◉',
  folder: '📁',
  file: '📄',
  check: '✔',
  skip: '⊘',
}

const sizeUnits = ['B', 'KiB', 'MiB', 'GiB']

export function formatSize(bytes: number) {
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < sizeUnits.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${sizeUnits[unit]}`
}

/** Formats an ISO timestamp as YYYY-MM-DD */
export function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Describes a plugin's overrides on one line, e.g. "loader spigot, Minecraft 1.20.4". Returns undefined when
 * there are no overrides to show, so callers can skip the line entirely instead of printing an empty one.
 */
export function formatOverrides(overrides: PluginOverrides | undefined): string | undefined {
  const parts = []
  if (overrides?.loader) parts.push(`loader ${overrides.loader}`)
  if (overrides?.gameVersion) parts.push(`Minecraft ${overrides.gameVersion}`)
  return parts.length > 0 ? parts.join(', ') : undefined
}

export const output = {
  success(message: string) {
    console.log(chalk.bold.greenBright(`${symbols.success} ${message}`))
  },

  error(message: string) {
    console.log(chalk.bold.redBright(`${symbols.error} ${message}`))
  },

  warning(message: string) {
    console.log(chalk.bold.yellowBright(`${symbols.warning} ${message}`))
  },

  info(message: string) {
    console.log(chalk.bold.cyanBright(`${symbols.info} ${message}`))
  },

  plus(message: string) {
    console.log(chalk.bold.greenBright(`+ ${message}`))
  },

  minus(message: string) {
    console.log(chalk.bold.redBright(`- ${message}`))
  },

  download(message: string) {
    console.log(chalk.bold.blueBright(`${symbols.download} ${message}`))
  },

  update(message: string) {
    console.log(chalk.bold.magentaBright(`${symbols.update} ${message}`))
  },

  pluginName(name: string) {
    return chalk.bold.greenBright(name)
  },

  version(version: string) {
    return chalk.yellowBright(version)
  },

  versionType(versionType: string) {
    const color = versionType === 'release' ? chalk.greenBright : chalk.bold.yellowBright
    return color(`(${versionType})`)
  },

  label(label: string) {
    return chalk.dim.cyan(`${label}:`)
  },

  dependency(message: string) {
    console.log(chalk.magentaBright(`${symbols.info} ${message}`))
  },

  header(message: string) {
    console.log(chalk.bgBlueBright.black.bold(` ${message} `))
  },

  file(message: string, type: 'downloaded' | 'skipped' = 'downloaded') {
    let symbol
    let color
    switch (type) {
      case 'downloaded':
        symbol = symbols.check
        color = chalk.greenBright
        break
      case 'skipped':
        symbol = symbols.skip
        color = chalk.dim
        break
      default:
        throw new SanityCheckError(`Unknown type ${type satisfies never}`)
    }

    console.log(color(`${symbol} ${symbols.file} ${message}`))
  },

  pluginCard(data: {
    title?: string
    url?: string
    slug?: string
    description?: string
    author?: string
    downloads?: number
    version?: string
    versionType?: string
    loaders?: string[]
    filename?: string
    size?: number
    publishedAt?: string
    mcVersions?: string[]
    overrides?: PluginOverrides
    categories?: string[]
    dependencies?: string[]
    requiredBy?: string[]
    issuesUrl?: string
    sourceUrl?: string
    wikiUrl?: string
    discordUrl?: string
  }) {
    console.log(chalk.bold.greenBright(`\n${symbols.plugin} ${data.title}`))
    if (data.description) {
      console.log(`   ${data.description}`)
    }
    if (data.slug) {
      console.log(`   ${this.label('Slug')} ${this.highlight(data.slug)}`)
    }
    if (data.author) {
      console.log(`   ${this.label('Author')} ${chalk.white(data.author)}`)
    }
    if (data.downloads !== undefined) {
      console.log(`   ${this.label('Downloads')} ${this.version(data.downloads.toLocaleString())}`)
    }
    if (data.version) {
      const versionType = data.versionType ? ` ${this.versionType(data.versionType)}` : ''
      console.log(`   ${this.label('Version')} ${this.version(data.version)}${versionType}`)
    }
    if (data.loaders && data.loaders.length > 0) {
      console.log(`   ${this.label('Loader')} ${chalk.blueBright(data.loaders.join(', '))}`)
    }
    if (data.mcVersions) {
      console.log(`   ${output.label('MC Versions')} ${chalk.dim.yellowBright(data.mcVersions.join(', ') ?? 'N/A')}`)
    }
    // Only shown when the plugin resolved against something other than plugins.json's loader or Minecraft version
    const overrides = formatOverrides(data.overrides)
    if (overrides) {
      console.log(`   ${this.label('Override')} ${chalk.yellowBright(overrides)}`)
    }
    if (data.filename) {
      const size = data.size === undefined ? '' : ` ${this.dim(`(${formatSize(data.size)})`)}`
      console.log(`   ${this.label('File')} ${chalk.white(data.filename)}${size}`)
    }
    if (data.publishedAt) {
      console.log(`   ${this.label('Published')} ${chalk.white(formatDate(data.publishedAt))}`)
    }
    if (data.categories && data.categories.length > 0) {
      console.log(`   ${this.label('Categories')} ${chalk.magenta(data.categories.join(', '))}`)
    }
    if (data.dependencies && data.dependencies.length > 0) {
      console.log(`   ${this.label('Dependencies')} ${chalk.magentaBright(data.dependencies.join(', '))}`)
    }
    if (data.requiredBy && data.requiredBy.length > 0) {
      console.log(`   ${this.label('Required by')} ${chalk.magentaBright(data.requiredBy.join(', '))}`)
    }
    if (data.url) {
      console.log(`   ${this.label('URL')} ${this.url(data.url)}`)
    }
    if (data.issuesUrl) {
      console.log(`   ${output.label('Issues')} ${this.url(data.issuesUrl)}`)
    }
    if (data.sourceUrl) {
      console.log(`   ${output.label('Source')} ${this.url(data.sourceUrl)}`)
    }
    if (data.wikiUrl) {
      console.log(`   ${output.label('Wiki')} ${this.url(data.wikiUrl)}`)
    }
    if (data.discordUrl) {
      console.log(`   ${output.label('Discord')} ${this.url(data.discordUrl)}`)
    }
  },

  blank() {
    console.log()
  },

  highlight(text: string) {
    return chalk.bold.whiteBright(text)
  },

  dim(text: string) {
    return chalk.dim(text)
  },

  url(url: string) {
    return chalk.cyan.underline(url)
  },
}
