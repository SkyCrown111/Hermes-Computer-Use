import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore build output and dependencies
  { ignores: ['dist', 'src-tauri', 'node_modules'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks rules
      ...reactHooks.configs.recommended.rules,

      // React Refresh — only warn on non-component exports
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Relax strict rules that conflict with project conventions:
      // Allow unused parameters prefixed with _ (common TypeScript convention)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Allow explicit any in some cases (Tauri IPC returns untyped data)
      '@typescript-eslint/no-explicit-any': 'warn',

      // console.log is used for Tauri-side debugging
      'no-console': 'off',
    },
  },
);
