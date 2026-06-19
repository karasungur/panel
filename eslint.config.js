const { defineConfig } = require('eslint/config');
const js = require('@eslint/js');
const globals = require('globals');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = defineConfig([
    {
        ignores: [
            'node_modules/**',
            'coverage/**',
            'database/*.db',
            'database/uploads/**',
            'public/uploads/**',
            'public/turkiye*.svg'
        ]
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2023
            }
        },
        rules: {
            'no-console': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ]
        }
    },
    eslintConfigPrettier
]);
