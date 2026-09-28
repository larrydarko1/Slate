#!/usr/bin/env node
/**
 * Document-level standards gate for the renderer shell. `src/renderer/index.html` is
 * the one file ESLint's Vue parser never reads, and stylelint has the same blind spot
 * one level down: it can police how a rule is written but not that a rule still
 * EXISTS. The rules live in @larrydarko/lint-config/gates/html-standards.
 *
 * What stays here is this repo's answers.
 *
 * `require` is three tags: `lang`, which screen readers read first; `charset`; and
 * `appMount`, because renaming `#app` renders nothing with no error. `title` is left
 * out because src/main/index.ts sets `title: ''` on purpose and a `<title>` in the
 * shell would override the window title the main process chose. Viewport,
 * theme-color and an icon are not required either: this is a packaged desktop app
 * with no mobile viewport, no browser chrome and no tab.
 *
 * `csp: true` — in a packaged build the renderer loads over `file://`, where there is
 * no server to send a header, so the meta tag IS the policy. An opened .slate file
 * is arbitrary JSON someone else wrote, and every value in it reaches the screen,
 * so the policy is checked positively and negatively: a CSP degrades silently, and a
 * directive someone widened still parses, still loads the app, and reports nothing.
 *
 * The no-remote-subresources rule needs no option: Slate's claim is that nothing
 * leaves the device, and a single remote `<script>` or `<link>` in the shell breaks
 * that claim at the one point where the CSP is also the only guard.
 */
import { checkHtmlStandards } from '@larrydarko/lint-config/gates/html-standards';

checkHtmlStandards({
    indexHtml: 'src/renderer/index.html',
    baseScss: 'src/renderer/styles/_base.scss',
    require: ['lang', 'charset', 'appMount'],
    csp: true,
});
