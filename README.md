# PluginsUtils

## Usage

```
yarn run-cli --help
plugins <cmd> [args]

Commands:
  plugins search <plugin>     Search for plugins
  plugins add <plugin...>     Add plugins
  plugins view <plugin...>    View information about existing plugins
  plugins show                Show a summary of all plugins in plugins.json
  plugins remove <plugin...>  Remove plugins
  plugins install             Install plugins
  plugins update              Update plugins
  plugins completion          generate completion script

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

### Pinning a version

When adding a Modrinth plugin, you can pin it to a specific version with `<plugin>@<version>`. The version must exactly
match the Modrinth version number. Without it, the latest matching version is resolved.

```
yarn run-cli add fastasyncworldedit@2.15.1
```

Note that `update` does not currently preserve a pin, and will move the plugin back to the latest version.

### Targeting a Minecraft version

Pass `--game-version` (or `--mc-version`) to `add` or `update` to only consider plugin versions supporting that
Minecraft version.

```
yarn run-cli add fastasyncworldedit --game-version 1.21.1
yarn run-cli update --game-version 1.21.1
```

Like a version pin, this is not remembered. It has to be passed on every `add` and `update`, or the next `update` will
move plugins to whatever is newest regardless of the Minecraft version it supports.

### Featured versions only

Pass `--featured` to `add` or `update` to only consider versions the author has marked as featured on Modrinth. It
doesn't apply to dependencies, and like `--game-version` it has to be passed every time.

### Filtering search results

`search` only shows plugins that run on Paper by default, including those built for Spigot or Bukkit. Pass `--loader` to
search for a different loader, and `--game-version` (or `--mc-version`) to only show plugins supporting that Minecraft
version.

```
yarn run-cli search worldedit --game-version 1.21.1
yarn run-cli search luckperms --loader velocity
```

Both are matched against individual versions, so passing both only shows plugins with a single version supporting the
loader and the Minecraft version together.

## How it works

Whenever you add, remove or update a plugin, the changes will be reflected in plugins.json. This file acts as your lock
file, and all installs will be validated against it.

When you install plugins, three folders will be created:

- `managedPlugins` where plugins automatically downloaded go
- `unmanagedPlugins` where you can put anything that not managed by the script. Configs go here.
- `plugins` the contents of `managedPlugins` and `unmanagedPlugins` merged into one folder.

## Developing

Run `yarn check` before committing. It runs lint, the format check, the typecheck and the tests. `yarn run-cli` uses
tsx, which doesn't typecheck, so type errors only show up here. Run the tests alone with `yarn test`.
