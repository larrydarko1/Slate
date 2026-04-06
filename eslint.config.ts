import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    // ── Global ignores ───────────────────────────────────────────────────────
    { ignores: ['out/', 'dist-electron/', 'node_modules/'] },

    // ── Base JS rules ────────────────────────────────────────────────────────
    js.configs.recommended,

    // ── TypeScript rules ─────────────────────────────────────────────────────
    ...ts.configs.recommended,

    // ── Vue rules ────────────────────────────────────────────────────────────
    ...vue.configs['flat/recommended'],

    // Vue files need the TypeScript parser inside <script> blocks
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: { parser: ts.parser },
        },
    },

    // Renderer code runs in the browser — expose DOM globals
    {
        files: ['src/renderer/**/*.{ts,vue}'],
        languageOptions: {
            globals: globals.browser,
        },
    },

    // Main + preload run in Node
    {
        files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
        languageOptions: {
            globals: globals.node,
        },
    },

    // ── Project-wide overrides ───────────────────────────────────────────────
    {
        rules: {
            // Allow unused vars when prefixed with _
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

            // We use explicit `any` sparingly — warn instead of error
            '@typescript-eslint/no-explicit-any': 'warn',

            // Single-word component names are ok for App.vue
            'vue/multi-word-component-names': 'off',
        },
    },

    // ── Prettier last — disables formatting rules that conflict ──────────────
    prettier,
];
