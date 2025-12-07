import neostandard, { plugins } from 'neostandard'

export default [
  ...neostandard({
    ts: true,
    noJsx: true,
    noStyle: true,
  }),
  {
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
  ...plugins['typescript-eslint'].configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNever: true,
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    ...plugins['typescript-eslint'].configs.disableTypeChecked,
  },
  {
    ignores: ['dist', 'node_modules', 'plugins', 'unmanagedPlugins', 'managedPlugins', 'plugins.json', 'changelog.md'],
  },
]
