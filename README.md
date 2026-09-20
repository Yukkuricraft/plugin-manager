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
  plugins update                            Update plugins
  plugins completion                        generate completion script

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

### Setting up

Every other command needs a `plugins.json`, which records the loader and Minecraft version the server runs. Create one
with `init`, which asks for both unless they're passed:

```
yarn run-cli init
yarn run-cli init --loader paper --game-version 1.21.1
```

`init` won't overwrite an existing `plugins.json`. A `plugins.json` made before `init` existed is rejected: delete it
and run `init`.

`show` prints the loader and Minecraft version above the plugin list, along with any substitutions, and marks each
plugin carrying an override or standing in for another.

### Working on another server

`plugins.json` doesn't have to live in this directory. It's usually kept in the server's own plugins directory, version
controlled alongside the configs that server writes. Point a command at one with `--plugins-json`:

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
yarn run-cli update --env env7
```

`environments.json` isn't committed, since its paths are specific to the machine the tool runs on. The directory it
names must already exist, but the `plugins.json` inside it doesn't have to — `init --env env7` can create one.

Without `--env` or `--plugins-json`, commands use `./plugins.json`, as they always have. The two options can't be
combined.

`managedPlugins` and `plugins` always stay in this directory, whichever server you're working on, so run `install` from
here rather than from the server's directory. Nothing is written to the server directory automatically — copy `plugins`
there yourself. Switching between servers means re-downloading whatever the other server didn't already have staged.

### Pinning a version

When adding a Modrinth plugin, you can pin it to a specific version with `<plugin>@<version>`. The version must exactly
match the Modrinth version number. Without it, the latest matching version is resolved.

```
yarn run-cli add fastasyncworldedit@2.15.1
```

Note that `update` does not currently preserve a pin, and will move the plugin back to the latest version.

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
lags, and `update` tries to bring it up to date every time. To drop it, add the plugin again with `--loader` set to the
server's loader.

### Dependencies

`add` reuses any dependency already in `plugins.json` instead of looking it up again, so adding a plugin doesn't move
dependencies already in `plugins.json` to newer versions, unless a plugin requires a specific newer build. `update` is
what moves dependencies to newer versions.

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
the substitute. A plugin can only be part of one substitution.

To drop a substitution:

```
yarn run-cli substitute --remove worldedit
```

Plugins already using the substitute keep it until they're next added or updated.

### URL plugins

Plugins that aren't on Modrinth can be added from a URL, with an identifier of your choice and a version label for the
file:

```
yarn run-cli add url:vault@1.7.3@https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar
```

`add` downloads the file once, checks that it's a JAR, and records its filename, size and SHA-512 in `plugins.json`,
along with when it was pinned, which `show` lists as its date. `install` checks every download against those, so if the
file behind the URL changes, `install` fails rather than install something else. Run `add` again to accept the new file.

A URL plugin can't share a filename with any other plugin, since both would be saved to the plugins folder under that
name.

`update` asks which URL plugins have a new file. For each one you pick, it asks for the new URL and version, and pins
the new file the same way. The rest are kept as they are.

#### Private GitHub releases

A release asset in a private GitHub repo can only be downloaded through GitHub's API, so its URL is the asset's API URL
rather than the link on the release page. List a release's asset URLs with:

```
gh api repos/<owner>/<repo>/releases/tags/<tag> --jq '.assets[] | .name + " " + .url'
```

Downloads from `api.github.com` send `GITHUB_TOKEN` as the token. Set it to a fine-grained personal access token that
has read access to the repo's contents.

`install` and `update` need it too, whenever a URL plugin comes from a private repo, so rather than passing it on every
command, put it in a `.env.yarn` file at the repo root:

```
GITHUB_TOKEN=github_pat_...
```

Yarn loads it automatically (it's already in `.gitignore`, so it's never committed):

```
yarn run-cli add url:griefdefender@3.1.1@https://api.github.com/repos/<owner>/<repo>/releases/assets/<id>
```

### Updating

`update` asks which Minecraft version to update plugins for, defaulting to the one in `plugins.json`, and updates
`plugins.json` to match. Pass `--game-version` to skip the question:

```
yarn run-cli update
yarn run-cli update --game-version 1.21.4
```

When a plugin, or one of its dependencies, has no version for that Minecraft version, `update` asks whether to keep it
at its current version or abort. Nothing is written unless every plugin is either updated or kept.

### Featured versions only

Pass `--featured` to `add` or `update` to only consider versions the author has marked as featured on Modrinth. It
doesn't apply to dependencies, and isn't remembered, so it has to be passed every time.

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

Whenever you add, remove or update a plugin, the changes will be reflected in plugins.json. This file acts as the lock
file, and all installs will be validated against it. It usually lives in the server's own plugins directory rather than
here — see "Working on another server".

When you install plugins, two folders are created in this directory, whichever server the lockfile belongs to:

- `managedPlugins` where downloaded plugins go, in a folder for each source: `managedPlugins/modrinth` and
  `managedPlugins/url`. A source only ever changes its own folder, and anything else in `managedPlugins` is deleted.
- `plugins` the contents of each source's folder merged into one folder. It's only replaced once every download has
  succeeded, so a failed install leaves the current plugins in place.

Both are rebuilt from the lockfile, so neither is worth keeping. `plugins` holds nothing but JARs: copy it into the
server's plugins directory yourself, which adds and replaces JARs there and leaves that server's configs and data alone.

## Developing

Run `yarn check` before committing. It runs lint, the format check, the typecheck and the tests. `yarn run-cli` uses
tsx, which doesn't typecheck, so type errors only show up here. Run the tests alone with `yarn test`.
