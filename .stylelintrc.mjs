export default {
    extends: ['stylelint-config-standard-scss'],
    referenceFiles: [
        { files: ['src/renderer/styles/_themes.scss'], customSyntax: 'postcss-scss' },
        { files: ['src/renderer/styles/_tokens.scss'], customSyntax: 'postcss-scss' },
    ],
    plugins: ['stylelint-scss', 'stylelint-declaration-strict-value'],
    rules: {
        // –– COLOR FUNCTIONS –––––––––––––––––––––––––––––––––––––––––––––––
        'color-function-notation': 'modern',

        // –– UNITS –––––––––––––––––––––––––––––––––––––––––––––––––––––––––
        // `rem`, not `em`, for spacing and radius — this is where Slate departs
        // from the shared config. `em` anchors geometry to the element's own text,
        // which suits an app whose UI runs at the base font size. Slate's chrome
        // runs at 11–12px next to a canvas grid drawn in device pixels, so `em`
        // would make every control's padding shrink with its label and drift out of
        // step with the sheet beside it. `rem` keeps one anchor for the whole app
        // and still scales with the user's font-size preference, which is the part
        // that actually matters and the part `px` gives up.
        'declaration-property-unit-allowed-list': {
            'font-size': ['rem'],
            'line-height': [],
            'margin': ['rem'],
            'margin-top': ['rem'],
            'margin-bottom': ['rem'],
            'margin-left': ['rem'],
            'margin-right': ['rem'],
            'padding': ['rem'],
            'padding-top': ['rem'],
            'padding-bottom': ['rem'],
            'padding-left': ['rem'],
            'padding-right': ['rem'],
            'gap': ['rem'],
            'row-gap': ['rem'],
            'column-gap': ['rem'],
            'border-radius': ['rem'],
            'min-width': ['%', 'px', 'vh', 'vw', 'dvh', 'dvw', 'ch'],
            'max-width': ['%', 'px', 'vh', 'vw', 'dvh', 'dvw', 'ch'],
            'min-height': ['%', 'px', 'vh', 'vw', 'dvh', 'dvw'],
            'max-height': ['%', 'px', 'vh', 'vw', 'dvh', 'dvw'],
            'width': ['px', '%', 'vh', 'vw', 'dvh', 'dvw'],
            'height': ['px', '%', 'vh', 'vw', 'dvh', 'dvw'],
            'top': ['px', '%'],
            'right': ['px', '%'],
            'bottom': ['px', '%'],
            'left': ['px', '%'],
            'blur': ['px'],
            'grid-template-columns': ['fr', 'rem', '%'],
            'grid-template-rows': ['fr', 'rem', '%'],
        },

        // –– NO VENDOR PREFIXES –––––––––––––––––––––––––––––––––––––––––––––––
        'property-no-vendor-prefix': true,
        'value-no-vendor-prefix': true,
        'selector-no-vendor-prefix': true,
        'at-rule-no-vendor-prefix': true,

        // –– SCSS VARIABLES –––––––––––––––––––––––––––––––––––––––––––––––
        'scss/dollar-variable-pattern': '^[a-z][a-z0-9-]*$',
        'scss/dollar-variable-empty-line-before': null,

        // –– LAYOUT –––––––––––––––––––––––––––––––––––––––––––––––––––––––––
        'property-no-unknown': [
            true,
            {
                ignoreProperties: ['/^composes/'],
            },
        ],

        // –– SCSS NESTED PROPERTIES –––––––––––––––––––––––––––––––––––––––––––
        'scss/declaration-nested-properties': 'never',

        // –– DESIGN TOKENS –––––––––––––––––––––––––––––––––––––––––––––––
        'no-unknown-custom-properties': true,
        'scale-unlimited/declaration-strict-value': [
            ['/color$/', 'fill', 'stroke'],
            {
                // `currentcolor` is listed lowercase as well as camel: `value-keyword-case` above
                // rewrites every occurrence to lowercase, after which `currentColor` never matches.
                ignoreValues: [
                    'transparent',
                    'currentColor',
                    'currentcolor',
                    'inherit',
                    'initial',
                    'unset',
                    'revert',
                    'none',
                ],
                disableFix: true,
            },
        ],

        // –– SCOPED STYLES –––––––––––––––––––––––––––––––––––––––––––––––
        'selector-max-specificity': ['1,4,1'],
        'selector-max-id': 1,

        // –– GENERAL BEST PRACTICES –––––––––––––––––––––––––––––––––––––
        'color-no-invalid-hex': true,
        'declaration-no-important': true,
        'declaration-block-no-duplicate-properties': true,
        'no-descending-specificity': null,
        'selector-pseudo-element-no-unknown': true,
        'media-feature-name-no-unknown': true,
        'at-rule-no-unknown': null,

        // –– IGNORE SCOPED STYLES SPECIFICITY FOR VUE –––––––––––––––––––––––––––––––––––––––––––
        'selector-pseudo-class-no-unknown': [
            true,
            {
                ignorePseudoClasses: ['deep', 'global', 'v-deep', 'v-global'],
            },
        ],
    },
    overrides: [
        {
            files: ['**/*.vue'],
            customSyntax: 'postcss-html',
        },
    ],
};
