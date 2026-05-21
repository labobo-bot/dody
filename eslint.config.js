import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**/*', 'firestore.rules']
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        localStorage: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLFormElement: 'readonly',
        process: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
