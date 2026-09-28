#!/usr/bin/env node
/**
 * SCSS architecture gate. Stylesheets fail quietly — nothing throws when a token
 * is missing from one theme, when a rule is emitted once per component, or when a
 * `var()` names something nothing declares. The rules live in
 * @larrydarko/lint-config/gates/scss-standards.
 *
 * What stays here is this repo's answers.
 *
 * THE THREE FILE ROLES. `index.scss` is the BARREL: it `@forward`s variables and
 * mixins and nothing else. It is also the INJECTED module — electron.vite.config.ts
 * prepends `@use '@/renderer/styles' as *` to every SFC style block, and each block
 * is its own Sass compilation, so anything reachable from the barrel that emits a
 * rule ships once per component. `global.scss` is the ENTRY: it `@use`s the modules
 * that do emit, and main.ts imports it exactly once.
 *
 * `themes.source: 'css-blocks'` — the palettes are literal custom-property blocks
 * in _themes.scss, one `[data-theme='…']` block per theme, plus a `:root` block for
 * the frame that paints before Toolbar.vue writes `data-theme` onto <html>. They are
 * written out rather than generated from a Sass map, because a map is opaque both to
 * this gate and to stylelint's `no-unknown-custom-properties`.
 *
 * `invariantFile` — colours that are the same in every theme live once in
 * _tokens.scss, on `:root`. They are exempt from parity by construction, since
 * there is nothing for them to disagree with, but they still count as declared for
 * the `var()` sweep. Repeating one in both theme blocks is what `dup:check` catches.
 */
import { checkScssStandards } from '@larrydarko/lint-config/gates/scss-standards';

checkScssStandards({
    styles: 'src/renderer/styles',
    src: 'src/renderer',
    barrel: 'index.scss',
    entry: 'global.scss',
    injected: 'index.scss',
    mainScript: 'src/renderer/main.ts',
    viteConfigs: ['electron.vite.config.ts'],
    injectedSpecifier: '@/renderer/styles',
    forwarded: ['variables', 'mixins'],
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
});
