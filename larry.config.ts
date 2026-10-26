// The gates `larry check` runs, and each one's options. The editor lists every option a gate takes.
import { defineConfig } from '@larrydarko/lint-config/config';

/**
 * Files over the 400-line softcap when the ratchet was set, at the size they were.
 * A file may shrink freely; growing past its entry, or a new file crossing the cap,
 * fails. Lower a number when you refactor, never raise it — and when one drops back
 * under the cap the gate says so, because an entry left behind is a licence to
 * regrow to the old number.
 */
const LENGTH_BASELINE: Record<string, number> = {
    // 687 lines of template — one <button> per formatting control, each with its
    // own inline SVG. Splitting means pulling the SVGs out, not the logic.
    'src/renderer/components/Toolbar.vue': 859,
    // 265 lines of script and a 261-line template: neither half is over on its own.
    'src/renderer/components/SpreadsheetTable.vue': 526,
};

export default defineConfig({
    family: 'electron',
    gates: {
        // The allowlist is the one part that is this project's decision, and the goal is for it to stay
        // empty: an entry is only ever right when the fix is out of reach from here.
        'audit': {
            allowlist: [
                // Each entry: { id, package, reason, expires }. The reason must say BOTH
                // why it cannot be fixed here and why it is unreachable in Slate's code.
            ],
        },
        // An SFC filename is PascalCase because it is the component name; everything else under src/ is
        // camelCase. Headers: first match wins. A main-process module under lib/ or services/ owes a JSDoc
        // block, since which external concern it owns is not derivable from its exports; a composable owes a
        // `//` line saying what state it owns; an SFC owes nothing, since defineProps and defineEmits are the
        // contract. The baseline counts non-blank lines without `<style>`.
        'code-style': {
            scan: ['src'],
            baseline: LENGTH_BASELINE,
            casing: [
                { files: /\.vue$/, style: 'pascal' },
                { files: /\.ts$/, style: 'camel' },
            ],
            headers: [
                { files: /^src\/main\/(lib|services)\/.*\.ts$/, require: 'jsdoc' },
                { files: /^src\/renderer\/composables\/.*\.ts$/, require: 'comment' },
                { files: /\.vue$/, require: 'none' },
            ],
        },
        'contrast': { skip: 'No script ran it before larry upgrade.' },
        // A dependency Electron loads indirectly (a native backend, a builder hook) looks unused to an import
        // graph: it goes under `ignoreDependencies` in knip.config.js with a reason, never in a raised
        // budget. Budgets are all zero and stay there.
        'dead-code': {
            notMachineChecked:
                'code reachable from an entry point but never reached at RUNTIME — an IPC handler nothing calls, a branch no setting enables.',
        },
        // src/ and tests/ are the whole scope. Slate is one package, so imports get three groups: builtin,
        // external, local. `@test-utils` is a tsconfig path into this repo, so it sorts as local.
        'declaration-order': {
            sourceRoots: ['src', 'tests'],
            importOrder: { localAliases: ['@test-utils'] },
        },
        // Each number is a judgement that only goes down, split by format because the three have different
        // stakes. A false positive (two blocks alike that mean different things) raises a ceiling with a
        // comment; the code stays as is.
        'duplication': {
            scan: ['src'],
            ceilings: {
                typescript: { limit: 4, note: 'logic — two copies of a branch is how a fixed bug comes back.' },
                scss: {
                    limit: 8,
                    note: 'presentation — real debt, and what the shared patterns in styles/components/ exist to absorb, but a stale copy makes something look wrong rather than behave wrong.',
                },
                html: {
                    limit: 6,
                    note: 'SFC markup — structural repetition is often cheaper than another component.',
                },
            },
            // The largest clone today is 132 tokens: the text-colour menu, which Toolbar.vue
            // renders twice, once for cells and once for text boxes.
            maxCloneTokens: 160,
        },
        // `require` is three tags: `lang`, `charset`, and `appMount`, since renaming `#app` renders nothing
        // with no error. No `title`: src/main/index.ts sets `title: ''` on purpose. No viewport, theme-color
        // or icon: a desktop app has no mobile viewport, browser chrome or tab. `csp: true`: a packaged build
        // loads over `file://`, with no server to send a header, so the meta tag is the policy, and an opened
        // .slate file is arbitrary JSON whose every value reaches the screen.
        'html-standards': {
            indexHtml: 'src/renderer/index.html',
            baseScss: 'src/renderer/styles/_base.scss',
            require: ['lang', 'charset', 'appMount'],
            csp: true,
        },
        'i18n': { skip: 'No script ran it before larry upgrade.' },
        'licenses': { skip: 'No script ran it before larry upgrade.' },
        // One manifest, no workspaces. `private: true` guards against a stray `npm publish`, and `build`,
        // `main` and `os` are required because the packaging rules read them.
        'package-json': {
            rootRequired: [
                'name',
                'version',
                'description',
                'keywords',
                'homepage',
                'bugs',
                'license',
                'author',
                'repository',
                'type',
                'main',
                'engines',
                'os',
                'private',
                'packageManager',
                'build',
            ],
            tildeAllowed: {
                typescript:
                    'Its minor releases introduce new type errors, so a minor bump is a code change, not a dependency bump.',
            },
        },
        'pipeline': {},
        'refactoring': {},
        // `index.scss` is the entry, imported once by main.ts. `_variables.scss` is injected into every SFC
        // style block, each its own Sass compilation, so anything reachable from it that emits ships once per
        // component; the mixins live there because a mixin emits nothing until included. The palettes are
        // literal `[data-theme]` blocks in _themes.scss, plus a `:root` block for the frame painted before
        // Toolbar.vue sets `data-theme`: a Sass map would be opaque to this gate and to stylelint. Colours
        // the same in every theme live once in _tokens.scss.
        'scss-standards': {
            styles: 'src/renderer/styles',
            src: 'src/renderer',
            mainScript: 'src/renderer/main.ts',
            viteConfigs: ['electron.vite.config.ts'],
            injectedSpecifier: '@/renderer/styles/variables',
            emitters: [
                {
                    module: 'tokens',
                    why: '_tokens.scss holds the colours that are the same in every theme. Un-@used, every `var()` naming one of them resolves to nothing.',
                },
                {
                    module: 'themes',
                    why: 'The palettes are CSS custom properties. Un-@used, every `var(--token)` in the app resolves to nothing.',
                },
                {
                    module: 'base',
                    why: '_base.scss carries the reset, element defaults and the Electron drag regions. Un-@used, none of it reaches the bundle.',
                },
                {
                    module: 'components',
                    why: 'components/ holds the classes shared across unrelated SFCs. Un-@used, every template naming one of them renders unstyled.',
                },
            ],
            themes: {
                source: 'css-blocks',
                file: 'src/renderer/styles/_themes.scss',
                reference: 'dark',
                selector: 'data-theme',
                invariantFile: 'src/renderer/styles/_tokens.scss',
            },
        },
        'secrets': { skip: 'No script ran it before larry upgrade.' },
        // Tests mirror src/ under tests/, one top-level directory per src/ directory: add a new area to both
        // together. `e2e: false` is a decision, not a gap: Playwright's Electron API is experimental, so
        // raise adding E2E before doing it. Thresholds only rise and the exclude list may not grow.
        // `vmBaseline: 0`: `wrapper.vm` is counted rather than banned.
        'testing': {
            config: 'vitest.config.ts',
            layout: { kind: 'mirrored', root: 'tests', areas: ['main', 'preload', 'renderer', 'schemas'] },
            e2e: false,
            thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
            excludes: {
                'src/renderer/main.ts': 'renderer bootstrap — mounts the app and installs plugins, no branch to cover',
                'src/main/index.ts': 'Electron entry — creates the BrowserWindow, only exercised by launching the app',
                'src/**/*.d.ts': 'declarations, no runtime',
                'src/**/*.html': 'markup, not code',
            },
            domEnvironment: { name: 'jsdom', config: 'vitest.config.ts' },
            vmBaseline: 0,
        },
        // The renderer runs with context isolation on and node integration off, so `process`, `Buffer` and
        // `require` do not exist there. `browserSources` checks the code as well as the config: one `///
        // <reference types="node" />` in any dependency's typings puts Node's globals in scope. Tests are
        // exempt. `nonEmitting` is not passed: no package here is consumed as TypeScript source.
        'tsconfigs': {
            nodeTyped: ['tsconfig.node.json'],
            browserProjects: ['tsconfig.app.json'],
            browserSources: ['src/renderer'],
        },
        // No options: the renderer has no `v-html` and the app registers no custom protocol. The first
        // `v-html` fails until a `vHtml` entry says why it is safe.
        'electron-security': {},
        // `cleanupRequired` is empty: the main process opens a dialog, reads or writes one .slate file and
        // returns. Add a service the day one owns a watcher, a socket or a native session.
        'error-handling/electron': { cleanupRequired: [] },
        'ipc-standards': {},
    },
});
