import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/generated/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // Prisma 7's source generator marks generated TypeScript with @ts-nocheck. The
    // types remain strict under tsc, but typescript-eslint reports every delegate
    // result as an internal "error" type. Keep the strict typecheck gate and scope
    // this compatibility exception only to modules that execute Prisma delegates.
    files: [
      'apps/api/src/database/**/*.ts',
      'apps/api/src/identity/auth.service.ts',
      'apps/api/src/identity/passkey.service.ts',
      'apps/api/src/identity/session.service.ts',
      'apps/api/src/organizations/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
