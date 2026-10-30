# PluginsUtils

## Usage

```
yarn run-cli --help
plugins <cmd> [args]

Commands:
  plugins init                              Create plugins.json for a server
  plugins search <plugin>                   Search for plugins
  plugins add <plugin..>                    Add plugins
  plugins view <plugin..>                   View information about existing
                                            plugins
  plugins show                              Show a summary of all plugins in
                                            plugins.json
  plugins remove <plugin..>                 Remove plugins
  plugins substitute <plugin> [substitute]  Use one plugin wherever another is
                                            required
  plugins install                           Install plugins
  plugins update                            Update the plugins of one source
  plugins publish <id> <version> <jar>      Release a JAR into the gh-release
                                            repo as the tag <id>/<version>
  plugins completion                        generate completion script

Options:
  --env           The server to work on, by a name in environments.json, which
                  maps names to server plugins directories. Its plugins.json is
                  used.                                                 [string]
  --plugins-json  The plugins.json to work on. Defaults to ./plugins.json. Use
                  --env instead to name a server set up in environments.json.
                                                                        [string]
  --help          Show help                                            [boolean]
```

### Setting up

Every other command needs a `plugins.json`, which records the loader and Minecraft version the server runs. Create one
with `init`, which asks for both unless they're passed:

```
yarn run-cli init
yarn run-cli init --loader paper --game-version 1.21.1
```

`show` prints the loader and Minecraft version above the plugin list, along with any substitutions, and marks each
plugin carrying an override or standing in for another.

### Working on another server

`plugins.json` is usually kept in the server's own plugins directory rather than here, version controlled alongside the
configs that server writes. Point a command at one with `--plugins-json`:

```
yarn run-cli show --plugins-json /var/lib/yukkuricraft/env/env1/minecraft/yukkuricraft/plugins/plugins.json
```

To avoid typing that path every time, create `environments.json` here, mapping a name to each server's plugins
directory:

```json
{
  "env1": "/var/lib/yukkuricraft/env/env1/minecraft/yukkuricraft/plugins",
  "env7": "/var/lib/yukkuricraft/env/env7/minecraft/yukkuricraft/plugins"
}
```

Then name a server with `--env`, which uses the `plugins.json` inside its directory:

```
yarn run-cli show --env env1
yarn run-cli update modrinth --env env7
```

`environments.json` isn't committed, since its paths are specific to the machine the tool runs on.

Without `--env` or `--plugins-json`, commands use `./plugins.json`. The two options can't be combined.

`managedPlugins` and `plugins` stay in this directory, so run `install` from here. Copy `plugins` into the server's
directory yourself. Switching between servers means re-downloading whatever the other server didn't already have staged.

### Pinning a version

When adding a Modrinth plugin, you can pin it to a specific version with `<plugin>@<version>`. The version must exactly
match the Modrinth version number. Without it, the latest matching version is resolved.

```
yarn run-cli add fastasyncworldedit@2.15.1
```

To move a pinned plugin to another version, run `update modrinth <plugin>`. `update modrinth` with no plugins named
drops pins: it moves every plugin to its latest version for the Minecraft version.

### Overriding the loader or Minecraft version

`add` resolves against the loader and Minecraft version in `plugins.json`. Pass `--loader` or `--game-version` (or
`--mc-version`) to resolve the plugins being added against something else: to use a plugin's Spigot build instead of its
Paper one, say, or a version that hasn't been marked as supporting your Minecraft version but still works on it.

```
yarn run-cli add someplugin --loader spigot
yarn run-cli add oldplugin --game-version 1.20.4
```

`add` warns when it does this, and records the difference as an override on the plugin. A loader override is kept, so
updates keep resolving that plugin against its own loader. A Minecraft version override only records that the plugin
lags, and `update modrinth` tries to bring it up to date every time. To drop it, add the plugin again with `--loader`
set to the server's loader.

### Dependencies

`add` reuses any dependency already in `plugins.json` instead of looking it up again, unless a plugin requires a
specific newer build. `update modrinth` is what moves dependencies to newer versions.

### Substituting one plugin for another

Some plugins can replace another. FastAsyncWorldEdit, for example, is a fork of WorldEdit and works wherever WorldEdit
is required. Modrinth doesn't record this, so adding a plugin that depends on WorldEdit would install WorldEdit
alongside FastAsyncWorldEdit. Declare the substitution to prevent that:

```
yarn run-cli substitute worldedit fastasyncworldedit
```

From then on, every plugin that requires WorldEdit gets FastAsyncWorldEdit instead, using the one already installed if
there is one. WorldEdit itself can't be added while the substitution exists, and `install` refuses to run if
`plugins.json` contains it anyway.

A substitution can't be declared while the plugin being replaced is installed, since both would end up installed. Remove
it first; or, if other plugins pulled it in, remove them, declare the substitution, then add them back so they pick up
the substitute. A Modrinth project can be part of one substitution; a url or gh-release plugin can stand in for several
projects at once.

To drop a substitution:

```
yarn run-cli substitute --remove worldedit
```

Plugins already using the substitute keep it until they're next added or updated. `remove` refuses to remove the
substitute itself, whether it's a Modrinth project, a url plugin or a gh-release plugin, while the rule exists.

A substitute can also be a url plugin or a gh-release plugin, named with a `url:` or `gh-release:` prefix and already
present in `plugins.json`:

```
yarn run-cli add url:fastasyncworldedit@2.16.0@https://files.example/FAWE.jar
yarn run-cli substitute worldedit url:fastasyncworldedit
```

```
yarn run-cli substitute worldedit gh-release:fastasyncworldedit
```

Declaring one that hasn't been added fails, naming the `add` command to run first. A url or gh-release plugin carries no
dependency metadata, so a patched build that needs a plugin the upstream project didn't won't be reported.

### URL plugins

Plugins that aren't on Modrinth can be added from a URL, with an identifier of your choice and a version label for the
file:

```
yarn run-cli add url:vault@1.7.3@https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar
```

`add` downloads the file once, checks that it's a JAR, and records its filename, size and SHA-512 in `plugins.json`,
along with when it was pinned. `install` checks every download against those, so it fails if the file behind the URL
changes. Run `add` again to accept the new file.

A URL plugin can't share a filename with any other plugin, since both would be saved to the plugins folder under that
name.

`update url` asks which URL plugins have a new file. For each one you pick, it asks for the new URL and version, and
pins the new file the same way. Name the plugins to skip the first question:

```
yarn run-cli update url vault
```

#### Private GitHub releases

A release asset in a private GitHub repo can only be downloaded through GitHub's API, so its URL is the asset's API URL
rather than the link on the release page. List a release's asset URLs with:

```
gh api repos/<owner>/<repo>/releases/tags/<tag> --jq '.assets[] | .name + " " + .url'
```

Downloads from `api.github.com` send `GITHUB_TOKEN` as the token. Set it to a fine-grained personal access token that
has read access to the repo's contents.

`install` and `update url` need it too, whenever a URL plugin comes from a private repo.

For convenience, create a `.env.yarn` file at the repo root:

```
GITHUB_TOKEN=github_pat_...
```

Yarn loads it automatically (it's already in `.gitignore`):

```
yarn run-cli add url:griefdefender@3.1.1@https://api.github.com/repos/<owner>/<repo>/releases/assets/<id>
```

### GitHub release plugins

A `gh-release` plugin is a JAR attached to a release in a GitHub repo you control, such as one holding builds of plugins
that aren't on Modrinth. Set the repo in `plugins.json` as `config.releaseRepo`:

```json
"config": {
  "releaseRepo": "Yukkuricraft/plugin-artifacts"
}
```

Each release is tagged `<id>/<version>`, for example `griefdefender/3.1.11`, and carries the JAR as an asset. Add a
plugin by its id, then choose which of its releases to pin:

```
yarn run-cli add gh-release:griefdefender
```

The picker lists the plugin's releases newest first, each with its tag and date, and selects the newest. `add` records
the asset's filename, size and SHA-512 in `plugins.json`, and `install` checks the download against them.

`update gh-release` asks for a release of each plugin named, marking the pinned one `(current)`. With no names, it only
asks about plugins that aren't at their newest release:

```
yarn run-cli update gh-release
yarn run-cli update gh-release griefdefender
```

`publish` creates the release. Run it on the machine that has the JAR:

```
yarn run-cli publish griefdefender 3.1.11 ./GriefDefender.jar
```

It tags the release `griefdefender/3.1.11`, asks for a release title, and uploads the JAR. The title defaults to the
previous release's, with the new version. For a plugin's first release it asks for a display name, defaulting to the id,
and the title defaults to `<display name> v<version>`. It refuses a tag that already exists, with or without a release,
and asks for a different version. The release is created as a draft and published once the upload succeeds; if the
upload or publish fails, the draft is deleted. If deleting it fails too, `publish` names the draft to delete on GitHub.

`publish` asks for the repo the first time and saves it in `publish.json` in the current directory. Pass
`--repo <owner>/<name>` to use another one.

```
yarn run-cli publish --help
plugins publish <id> <version> <jar>

Release a JAR into the gh-release repo as the tag <id>/<version>

Positionals:
  id       The plugin id, the tag prefix                     [string] [required]
  version  The version label, e.g. "3.1.11"                  [string] [required]
  jar      Path to the JAR to upload                         [string] [required]

Options:
  --repo  The GitHub repo to release into, as owner/name. Defaults to the repo
          saved in ./publish.json, which is asked for and saved if missing
                                                                        [string]
```

Both use `GITHUB_TOKEN`, as set up in "Private GitHub releases". The server running `add`, `update gh-release` and
`install` needs a fine-grained token with `Contents: read` on the release repo. `publish` needs `Contents: write`.

### Updating

```
yarn run-cli update --help
plugins update

Update the plugins of one source

Commands:
  plugins update modrinth [plugin..]    Update named Modrinth plugins, or all of
                                        them for a Minecraft version
  plugins update url [plugin..]         Update URL plugins to a new file
  plugins update gh-release [plugin..]  Update gh-release plugins to a release
                                        from the release repo
```

`update modrinth` with no plugins named asks which Minecraft version to update plugins for, defaulting to the one in
`plugins.json`, and updates `plugins.json` to match. Pass `--game-version` to skip the question:

```
yarn run-cli update modrinth
yarn run-cli update modrinth --game-version 1.21.4
```

When a plugin, or one of its dependencies, has no version for that Minecraft version, it asks whether to keep the plugin
at its current version or abort. Nothing is written unless every plugin is either updated or kept.

```
yarn run-cli update modrinth --help
plugins update modrinth [plugin..]

Update named Modrinth plugins, or all of them for a Minecraft version

Positionals:
  plugin  Added Modrinth plugins to update, each to a build you pick for the
          Minecraft version in plugins.json. Dependencies only they use move to
          their newest build. Without any, every added Modrinth plugin moves to
          its newest build for --game-version              [array] [default: []]

Options:
  --game-version, --mc-version  The Minecraft version to update every Modrinth
                                plugin for, e.g. "1.21.4". Asked for if not
                                given, defaulting to the one in plugins.json,
                                which is then updated to match. Only without
                                plugin names.                           [string]
  --featured                    Only consider plugin versions the author has
                                marked as featured on Modrinth. Does not apply
                                to dependencies, and is not remembered between
                                runs. Only without plugin names.       [boolean]
```

#### Choosing a build

Naming plugins updates only those, for the Minecraft version already in `plugins.json`. `--game-version` and
`--featured` can't be combined with names.

```
yarn run-cli update modrinth luckperms
```

For each plugin, you pick from its builds for that Minecraft version, across release, beta and alpha channels, newest
first. Each row shows the version number, channel and date, and the pinned build is marked `(current)`. The newest
release is selected, or the newest build when there's no release. Builds sharing a version number, such as one JAR per
platform, are listed once, as the pinned build if it's one of them.

Only plugins you added can be named. A plugin that exists only as a dependency is updated by naming the plugin that
needs it.

Updating a plugin re-resolves the dependencies only it uses, prints the new build's dependencies with any warnings about
them, and reports what happened to each dependency:

```
Updating x because only a uses it
Not updating x because plugins other than a use it (b)
Adding w because a needs it
Removing y because only a used it
Not updating z because it was added to plugins.json itself
```

A dependency other plugins use keeps its build even when the new build pins another one:

```
a pins x 1.1.0, but x stays at 1.0.0 because plugins other than a use it (b)
```

### Featured versions only

Pass `--featured` to `add` or `update modrinth` to only consider versions the author has marked as featured on Modrinth.
It doesn't apply to dependencies, and has to be passed every time.

### Filtering search results

`search` only shows plugins that run on the loader in `plugins.json`, including those built for a loader it's compatible
with, and that have a version supporting its Minecraft version. Pass `--loader` or `--game-version` (or `--mc-version`)
to search for something else, or `--any-game-version` to include plugins whichever Minecraft versions they support, such
as ones that lag behind the server version but may still work.

```
yarn run-cli search worldedit --any-game-version
yarn run-cli search luckperms --loader velocity
```

The loader and Minecraft version are matched against individual versions, so a plugin only shows if a single version
supports both.

## How it works

Whenever you add, remove or update a plugin, the change is recorded in `plugins.json`. It's the lockfile: every install
is validated against it. It usually lives in the server's own plugins directory rather than here — see "Working on
another server".

When you install plugins, two folders are created in this directory:

- `managedPlugins` where downloaded plugins go, in a folder for each source: `managedPlugins/modrinth`,
  `managedPlugins/url` and `managedPlugins/gh-release`. A source only changes its own folder, and anything else in
  `managedPlugins` is deleted.
- `plugins` the contents of each source's folder merged into one folder. It's only replaced once every download has
  succeeded, so a failed install leaves whatever was already staged in place, which may be from a different server's
  lockfile.

Both are rebuilt from the lockfile, so neither is worth keeping. `plugins` holds nothing but JARs: copy it into the
server's plugins directory yourself.

## Developing

Run `yarn check` before committing. It runs lint, the format check, the typecheck and the tests. `yarn run-cli` uses
tsx, which doesn't typecheck, so type errors only show up here. Run the tests alone with `yarn test`.
