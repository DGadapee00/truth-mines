import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'data/', 'node_modules/', 'pipeline/', 'test-results/', 'playwright-report/', 'e2e/output/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // CLAUDE.md rule 1: core/ is pure graph logic. No three.js, nothing from app/.
  {
    files: ['core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', 'troika-three-text'], message: 'core/ must not import rendering code (CLAUDE.md rule 1).' },
            { group: ['**/app/**', '../app/*', '../../app/*'], message: 'core/ must not import from app/ (CLAUDE.md rule 1).' },
          ],
        },
      ],
    },
  },
);
