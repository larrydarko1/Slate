/**
 * Slate's ESLint config. The shared base — JS/TS/Vue presets, globals, strict type
 * rules, naming, test relaxations — comes from @larrydarko/lint-config. What stays
 * here is the wiring that is genuinely about Slate's folders: which selectors apply
 * to main, preload, renderer and schemas.
 */
import { larry } from '@larrydarko/lint-config/eslint';
import {
    electronStandards,
    bannedCryptoModules,
    loggerCallSelectors,
    errorHandlingSelectors,
    tsSourceSelectors,
    schemasBannedImports,
    rendererBannedImports,
    mainBannedImports,
    configModuleSelectors,
    noImportMetaEnv,
    noSingleLetterDeclaration,
    utilsBannedImportPatterns,
    libBannedImportPatterns,
    noStoreLibraryPatterns,
    aliasOnlyImportPatterns,
    functionContractsPlugin,
} from '@larrydarko/lint-config/eslint/electron';

const SOURCE = ['src/**/*.{ts,vue}', 'scripts/**/*.ts'];

export default larry({
    preset: 'electron',
    rootDir: import.meta.dirname,
    testProject: './tsconfig.test.json',
    // The scripts are run by Node directly, with no bundler in front, so an import there has to
    // name the real `.ts` file or it fails with ERR_MODULE_NOT_FOUND.
    importExtensions: { nodeRun: ['scripts/**/*.ts'] },

    // Slate ships in English only: there are no locale files for the i18n rules to read.
    standards: electronStandards({ i18n: false }),

    overrides: [
        {
            // The preload bridge is one object literal typed as `ElectronAPI`, so TypeScript
            // already checks every member against the contract the renderer consumes.
            // Re-annotating each arrow would duplicate src/schemas/electron.d.ts by hand.
            files: ['src/preload/**/*.ts'],
            rules: {
                '@typescript-eslint/explicit-function-return-type': [
                    'error',
                    { allowTypedFunctionExpressions: true, allowIIFEs: true },
                ],
            },
        },

        // ── Restricted syntax, composed per process ──────────────────────────
        // One block per area: `no-restricted-syntax` is last-match-wins, not additive.
        {
            files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
            rules: {
                'no-restricted-syntax': [
                    'error',
                    ...loggerCallSelectors,
                    ...errorHandlingSelectors,
                    ...tsSourceSelectors,
                    noSingleLetterDeclaration,
                ],
            },
        },
        {
            files: ['src/renderer/**/*.{ts,vue}'],
            rules: {
                'no-restricted-syntax': [
                    'error',
                    ...loggerCallSelectors,
                    ...errorHandlingSelectors,
                    noImportMetaEnv,
                    ...tsSourceSelectors,
                    noSingleLetterDeclaration,
                ],
            },
        },
        {
            files: ['src/schemas/**/*.ts'],
            rules: {
                'no-restricted-syntax': ['error', ...tsSourceSelectors, noSingleLetterDeclaration],
            },
        },
        {
            files: ['**/lib/config.ts'],
            rules: {
                'no-restricted-syntax': [
                    'error',
                    ...configModuleSelectors,
                    ...tsSourceSelectors,
                    noSingleLetterDeclaration,
                ],
            },
        },

        // ── Restricted imports, composed per process ─────────────────────────
        {
            files: ['src/main/**/*.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: bannedCryptoModules,
                        patterns: [...mainBannedImports.patterns, ...aliasOnlyImportPatterns],
                    },
                ],
            },
        },
        {
            files: ['src/main/lib/**/*.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: bannedCryptoModules,
                        patterns: [
                            ...mainBannedImports.patterns,
                            ...aliasOnlyImportPatterns,
                            ...libBannedImportPatterns,
                        ],
                    },
                ],
            },
        },
        {
            files: ['src/preload/**/*.ts'],
            rules: {
                'no-restricted-imports': ['error', { paths: bannedCryptoModules, patterns: aliasOnlyImportPatterns }],
            },
        },
        {
            files: ['src/schemas/**/*.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: bannedCryptoModules,
                        patterns: [...schemasBannedImports.patterns, ...aliasOnlyImportPatterns],
                    },
                ],
            },
        },
        {
            files: ['src/renderer/**/*.{ts,vue}'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: bannedCryptoModules,
                        patterns: [
                            ...rendererBannedImports.patterns,
                            ...noStoreLibraryPatterns,
                            ...aliasOnlyImportPatterns,
                        ],
                    },
                ],
            },
        },
        {
            files: ['src/renderer/utils/**/*.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: bannedCryptoModules,
                        patterns: [
                            ...rendererBannedImports.patterns,
                            ...noStoreLibraryPatterns,
                            ...aliasOnlyImportPatterns,
                            ...utilsBannedImportPatterns,
                        ],
                    },
                ],
            },
        },

        // ── Function contracts — the name must match what the signature promises ─
        {
            files: SOURCE,
            plugins: { contracts: functionContractsPlugin },
            rules: {
                'contracts/name-contract': 'error',
                'contracts/one-failure-channel': 'error',
                'contracts/no-undefined-hole': 'error',
                'contracts/no-boolean-flag': 'error',
                'no-nested-ternary': 'error',
            },
        },
    ],
});
