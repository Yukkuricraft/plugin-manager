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
file, and all installs will be validated against it.

When you install plugins, three folders will be created:

- `managedPlugins` where downloaded plugins go, in a folder for each source: `managedPlugins/modrinth` and
  `managedPlugins/url`. A source only ever changes its own folder, and anything else in `managedPlugins` is deleted.
- `unmanagedPlugins` where you can put anything that's not managed by the script. Configs go here.
- `plugins` the contents of each source's folder and of `unmanagedPlugins` merged into one folder. It's only replaced
  once every download has succeeded, so a failed install leaves the current plugins in place. Files in
  `unmanagedPlugins` win over downloaded ones with the same name.

## Developing

Run `yarn check` before committing. It runs lint, the format check, the typecheck and the tests. `yarn run-cli` uses
tsx, which doesn't typecheck, so type errors only show up here. Run the tests alone with `yarn test`.
