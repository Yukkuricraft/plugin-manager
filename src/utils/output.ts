import chalk from 'chalk'

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
        throw new Error(`Unknown type ${type satisfies never}`)
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
    mcVersions?: string[]
    categories?: string[]
    dependencies?: string[]
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
    if (data.url) {
      console.log(`  ${this.label('URL')} ${this.url(data.url)}`)
    }
    if (data.author) {
      console.log(`   ${this.label('Author')} ${chalk.white(data.author)}`)
    }
    if (data.downloads !== undefined) {
      console.log(`   ${this.label('Downloads')} ${this.version(data.downloads.toLocaleString())}`)
    }
    if (data.version) {
      console.log(`   ${this.label('Version')} ${this.version(data.version)}`)
    }
    if (data.mcVersions) {
      console.log(`   ${output.label('MC Versions')} ${chalk.dim.yellowBright(data.mcVersions.join(', ') ?? 'N/A')}`)
    }
    if (data.categories && data.categories.length > 0) {
      console.log(`   ${this.label('Categories')} ${chalk.magenta(data.categories.join(', '))}`)
    }
    if (data.dependencies && data.dependencies.length > 0) {
      console.log(`   ${this.label('Dependencies')} ${chalk.magentaBright(data.dependencies.join(', '))}`)
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
