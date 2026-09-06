import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'packages/contracts/src/abi/**',
      'packages/contracts/src/manifests/**',
      'apps/web/.next/**',
    ],
  },
  ...tseslint.configs.recommended,
);
