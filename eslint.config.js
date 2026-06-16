import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    '.claude',
    'android',
    'servidor.js',
    'awesome-claude-code',
    'awesome-claude-skills',
    'everything-claude-code',
    'marketingskills',
    'design-system',
    'agent-skills',
    'claude-agentic-framework',
    'claude-code-skills',
    'claude-git-pr-skill',
    'planning-with-files',
    'studio-recipes',
    'superpowers',
    'web-quality-skills',
  ]),
  // JS/JSX files
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', caughtErrorsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      // react-hooks v7: new aggressive rules off, exhaustive-deps downgraded to warn
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // TS/TSX files — TypeScript-aware rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint },
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-undef': 'off',           // TypeScript handles undefined references
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      // react-hooks v7: new aggressive rules off, exhaustive-deps downgraded to warn
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Component library files: co-locate types/constants/utilities with their components.
  // react-refresh fast-refresh applies to page entry points, not library files.
  {
    files: ['**/*Components.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
