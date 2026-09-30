#!/usr/bin/env node
/**
 * SCSS architecture gate. Stylesheets fail quietly — nothing throws when a token
 * is missing from one theme, when a rule is emitted once per component, or when a
 * `var()` names something nothing declares. The rules live in
 * @larrydarko/lint-config/gates/scss-standards.
 *
 * What stays here is this repo's answers.
 *
 * THE TWO FILE ROLES. `index.scss` is the ENTRY: it `@use`s the modules that
 * emit, and main.ts imports it exactly once. `_variables.scss` is the INJECTED
 * module — electron.vite.config.ts prepends it to every SFC style block, and each
 * block is its own Sass compilation, so anything reachable from it that emits a
 * rule ships once per component. The mixins live in it too, for that reason: a
 * mixin emits nothing until it is included. The gate fixes both names.
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
});
