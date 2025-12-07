# PluginsUtils

## Usage

```
yarn run-cli --help
plugins <cmd> [args]

Commands:
  plugins search <plugin>     Search for plugins
  plugins add <plugin...>     Add plugins
  plugins view <plugin...>    View information about existing plugins
  plugins remove <plugin...>  Remove plugins
  plugins install             Install plugins
  plugins update              Update plugins
  plugins completion          generate completion script

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

## How it works

Whenever you add, remove or update a plugin, the changes will be reflected in plugins.json. This file acts as your lock
file, and all installs will be validated against it.

When you install plugins, three folders will be created:

- `managedPlugins` where plugins automatically downloaded go
- `unmanagedPlugins` where you can put anything that not managed by the script. Configs go here.
- `plugins` the contents of `managedPlugins` and `unmanagedPlugins` merged into one folder.
