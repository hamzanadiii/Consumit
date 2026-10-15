import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/.next*/**',
    '**/coverage/**',
    '**/dist/**',
    '**/generated/**',
    '**/node_modules/**',
    // Vendored minified signing code from the upstream player bundle.
    'packages/provider-sdk/src/adapters/aphrodite-gate.ts',
    'design/**',
    'local/**',
    '**/tmp-*/**',
    '**/tmp-*',
  ]),
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    extends: [nextVitals, nextTypeScript],
  },
  {
    files: ['apps/api/**/*.ts', 'apps/playback/**/*.ts', 'apps/worker/**/*.ts', 'apps/release-worker/**/*.ts', 'packages/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
