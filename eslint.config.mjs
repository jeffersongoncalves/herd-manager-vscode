import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';

// Flat config (ESLint 9+ ignores .eslintrc.*); same rules as the former .eslintrc.json.
export default [
    js.configs.recommended,
    ...tseslint.configs['flat/recommended'],
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'warn',
        },
    },
];
