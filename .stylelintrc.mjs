import { stylelint } from '@larrydarko/lint-config/stylelint';

// `spacingUnit: 'rem'` — where Slate departs from the shared `em`. `em` anchors geometry to
// the element's own text, which suits an app whose UI runs at the base font size. Slate's
// chrome runs at 11–12px next to a canvas grid drawn in device pixels, so `em` would make every
// control's padding shrink with its label and drift out of step with the sheet beside it.
// `rem` keeps one anchor for the whole app and still scales with the user's font-size
// preference, which is the part that actually matters and the part `px` gives up.
// `lowercaseCurrentColor`: `value-keyword-case` rewrites every `currentColor` to lowercase, after
// which the camel spelling never matches the token rule's ignore list.
// `referenceFiles`: _themes.scss declares the per-theme `--tokens` and _tokens.scss the ones
// every theme shares, so both are loaded for context — without them each `var(--token)`
// elsewhere looks undeclared.
export default stylelint({
    spacingUnit: 'rem',
    lowercaseCurrentColor: true,
    referenceFiles: ['src/renderer/styles/_themes.scss', 'src/renderer/styles/_tokens.scss'],
});
