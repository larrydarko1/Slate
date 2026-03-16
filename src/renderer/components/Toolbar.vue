<script setup lang="ts">
// Toolbar — main formatting toolbar for cells and text boxes.
// Owns: font/color/type pickers, cell formatting actions, text box style controls.
// Does NOT own: cell state (useCells), text box state (useTextBoxes), undo/redo (useUndoRedo).

import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { SPREADSHEET_KEY } from '../composables/useSpreadsheet';
import type { CellDataType } from '../composables/spreadsheet/engine/cellTypes';
import type { TextBox } from '../types/spreadsheet';
import { getTypeLabel } from '../composables/spreadsheet/engine/cellTypes';
import ColorPicker from './toolbar/ColorPicker.vue';
import { colorPalette } from './toolbar/colorPalette';

defineEmits<{
    addTable: [];
    addTextBox: [];
    addChart: [];
    newFile: [];
    openFile: [];
    saveFile: [];
    mergeCells: [];
    unmergeCells: [];
}>();

const ss = inject(SPREADSHEET_KEY)!;

// ── TextBox formatting ──

const hasActiveTextBox = computed(() => !!ss.activeTextBoxId.value);

const activeTextBoxData = computed(() => {
    if (!ss.activeTextBoxId.value) return null;
    return ss.findTextBox(ss.activeTextBoxId.value) ?? null;
});

const tbColorMenuType = ref<'tbText' | 'tbFill' | 'tbBorder' | null>(null);
const tbLastTextColor = ref('#000000');
const tbLastFillColor = ref('#FFFFFF');
const tbLastBorderColor = ref('#CCCCCC');

function tbUpdateProp<K extends keyof TextBox>(prop: K, value: TextBox[K]) {
    const id = ss.activeTextBoxId.value;
    if (!id) return;
    ss.updateTextBox(id, { [prop]: value } as Partial<TextBox>);
}

function tbToggleBold() {
    const current = activeTextBoxData.value?.fontWeight ?? 'normal';
    tbUpdateProp('fontWeight', current === 'bold' ? 'normal' : 'bold');
}

function tbToggleItalic() {
    const current = activeTextBoxData.value?.fontStyle ?? 'normal';
    tbUpdateProp('fontStyle', current === 'italic' ? 'normal' : 'italic');
}

function tbSetAlign(a: 'left' | 'center' | 'right') {
    tbUpdateProp('align', a);
}

function tbIncreaseFontSize() {
    const size = activeTextBoxData.value?.fontSize ?? 14;
    tbUpdateProp('fontSize', Math.min(size + 2, 120));
}

function tbDecreaseFontSize() {
    const size = activeTextBoxData.value?.fontSize ?? 14;
    tbUpdateProp('fontSize', Math.max(size - 2, 8));
}

function tbApplyTextColor(color: string) {
    tbUpdateProp('textColor', color);
    if (color) tbLastTextColor.value = color;
    tbColorMenuType.value = null;
}

function tbApplyFillColor(color: string) {
    tbUpdateProp('bgColor', color);
    if (color) tbLastFillColor.value = color;
    tbColorMenuType.value = null;
}

function tbApplyBorderColor(color: string) {
    tbUpdateProp('borderColor', color);
    if (color) {
        tbLastBorderColor.value = color;
        // auto-set borderWidth to 1 if not set
        if (!activeTextBoxData.value?.borderWidth) tbUpdateProp('borderWidth', 1);
    }
    tbColorMenuType.value = null;
}

// ── Unified formatting (works for both cells and text boxes) ──

const fmtIsBold = computed(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontWeight === 'bold';
    const fmt = ss.getActiveCellFormat();
    return fmt?.bold ?? false;
});

const fmtIsItalic = computed(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontStyle === 'italic';
    const fmt = ss.getActiveCellFormat();
    return fmt?.italic ?? false;
});

const fmtAlign = computed<'left' | 'center' | 'right'>(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.align ?? 'left';
    const fmt = ss.getActiveCellFormat();
    return fmt?.align ?? 'left';
});

function fmtToggleBold() {
    if (hasActiveTextBox.value) {
        tbToggleBold();
    } else if (hasActiveCell.value) {
        const current = ss.getActiveCellFormat()?.bold ?? false;
        ss.setSelectionFormat({ bold: !current });
    }
}

function fmtToggleItalic() {
    if (hasActiveTextBox.value) {
        tbToggleItalic();
    } else if (hasActiveCell.value) {
        const current = ss.getActiveCellFormat()?.italic ?? false;
        ss.setSelectionFormat({ italic: !current });
    }
}

function fmtSetAlign(a: 'left' | 'center' | 'right') {
    if (hasActiveTextBox.value) {
        tbSetAlign(a);
    } else if (hasActiveCell.value) {
        ss.setSelectionFormat({ align: a });
    }
}

// ── Font family picker ──

const fontSelectorRef = ref<HTMLElement | null>(null);
const fontMenuOpen = ref(false);

const fontOptions = [
    'System Default',
    'Arial',
    'Helvetica Neue',
    'Georgia',
    'Times New Roman',
    'Courier New',
    'Menlo',
    'SF Mono',
    'Verdana',
    'Trebuchet MS',
    'Palatino',
    'Garamond',
    'Futura',
    'Avenir',
    'Gill Sans',
    'Optima',
];

const fmtFontFamily = computed(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontFamily ?? 'System Default';
    const fmt = ss.getActiveCellFormat();
    return fmt?.fontFamily ?? 'System Default';
});

function toggleFontMenu() {
    fontMenuOpen.value = !fontMenuOpen.value;
}

function fmtSetFont(font: string) {
    if (hasActiveTextBox.value) {
        tbUpdateProp('fontFamily', font);
    } else if (hasActiveCell.value) {
        ss.setSelectionFormat({ fontFamily: font === 'System Default' ? undefined : font });
    }
    fontMenuOpen.value = false;
}

// ── Type selector ──

const typeSelectorRef = ref<HTMLElement | null>(null);
const typeMenuOpen = ref(false);

const typeOptions: { value: CellDataType; label: string; short: string }[] = [
    { value: 'text', label: 'Text', short: 'ABC' },
    { value: 'integer', label: 'Integer', short: '123' },
    { value: 'float', label: 'Decimal', short: '1.2' },
    { value: 'percent', label: 'Percent (%)', short: '%' },
    { value: 'currency_usd', label: 'Dollar ($)', short: '$' },
    { value: 'currency_eur', label: 'Euro (€)', short: '€' },
];

const hasActiveCell = computed(() => !!ss.activeCell.value);

const currentCellType = computed<CellDataType>(() => {
    if (!ss.activeCell.value) return 'text';
    return ss.getCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row);
});

const supportsDecimals = computed(() => {
    const t = currentCellType.value;
    return t === 'float' || t === 'percent' || t === 'currency_eur' || t === 'currency_usd';
});

const currentTypeLabel = computed(() => {
    const opt = typeOptions.find((o) => o.value === currentCellType.value);
    return opt ? opt.short : getTypeLabel(currentCellType.value);
});

function changeDecimals(delta: number) {
    if (!ss.activeCell.value) return;
    const fmt = ss.getActiveCellFormat();
    const current = fmt?.decimalPlaces ?? 2;
    const next = Math.max(0, Math.min(10, current + delta));
    ss.setSelectionFormat({ decimalPlaces: next });
}

function toggleTypeMenu() {
    typeMenuOpen.value = !typeMenuOpen.value;
}

function setType(t: CellDataType) {
    if (!ss.activeCell.value) return;
    ss.setCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row, t);
    typeMenuOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
    if (typeMenuOpen.value && typeSelectorRef.value && !typeSelectorRef.value.contains(e.target as Node)) {
        typeMenuOpen.value = false;
    }
    if (fontMenuOpen.value && fontSelectorRef.value && !fontSelectorRef.value.contains(e.target as Node)) {
        fontMenuOpen.value = false;
    }
    // ColorPicker uses @click.stop internally, so any click reaching here is outside
    colorMenuType.value = null;
    tbColorMenuType.value = null;
}

// ── Cell coloring ──

const colorMenuType = ref<'text' | 'fill' | null>(null);
const lastTextColor = ref('#000000');
const lastFillColor = ref('#FFEB3B');

const currentTextColor = computed(() => {
    const fmt = ss.getActiveCellFormat();
    return fmt?.textColor ?? null;
});

const currentFillColor = computed(() => {
    const fmt = ss.getActiveCellFormat();
    return fmt?.bgColor ?? null;
});

function applyTextColor(color: string) {
    ss.setSelectionFormat({ textColor: color });
    lastTextColor.value = color;
    colorMenuType.value = null;
}

function applyFillColor(color: string) {
    ss.setSelectionFormat({ bgColor: color });
    lastFillColor.value = color;
    colorMenuType.value = null;
}

function clearTextColor() {
    ss.setSelectionFormat({ textColor: undefined });
    colorMenuType.value = null;
}

function clearFillColor() {
    ss.setSelectionFormat({ bgColor: undefined });
    colorMenuType.value = null;
}

// ── Theme ──

const isDark = ref(false);

onMounted(() => {
    const saved = localStorage.getItem('slate-theme');
    if (saved) {
        isDark.value = saved === 'dark';
    } else {
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme();
    document.addEventListener('click', onClickOutside);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', onClickOutside);
});

function toggleTheme() {
    isDark.value = !isDark.value;
    applyTheme();
    localStorage.setItem('slate-theme', isDark.value ? 'dark' : 'light');
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}
</script>

<template>
    <div class="toolbar">
        <div class="toolbar-group">
            <button class="tb has-label" title="New (⌘N)" @click="$emit('newFile')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M3.5 1.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linejoin="round"
                    />
                    <path
                        d="M9.5 1.5v3h3"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>New</span>
            </button>
            <button class="tb has-label" title="Open (⌘O)" @click="$emit('openFile')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M2 12.5V4a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V7"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                    <path
                        d="M1.5 12.5l1.5-5h10l1.5 5H1.5Z"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>Open</span>
            </button>
            <button class="tb has-label" title="Save (⌘S)" @click="$emit('saveFile')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M12.5 14.5h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h7l3 3v9a1 1 0 0 1-1 1Z"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linejoin="round"
                    />
                    <path d="M5.5 14.5v-4h5v4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
                    <path
                        d="M5.5 1.5v3h4"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span>Save</span>
            </button>
        </div>

        <div class="toolbar-sep" aria-hidden="true"></div>

        <div class="toolbar-group">
            <button class="tb has-label" title="Add Table" @click="$emit('addTable')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2 5.5h12M2 9.5h12M6 5.5v6.5" stroke="currentColor" stroke-width="1.3" />
                </svg>
                <span>Table</span>
            </button>
            <button class="tb has-label" title="Add Text Box" @click="$emit('addTextBox')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                    <path d="M5.5 6v4M5.5 6h5M8 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                </svg>
                <span>Text</span>
            </button>
            <button class="tb has-label" title="Add Chart" @click="$emit('addChart')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                    <rect x="4" y="8" width="2" height="4" rx="0.5" fill="currentColor" />
                    <rect x="7" y="5" width="2" height="7" rx="0.5" fill="currentColor" />
                    <rect x="10" y="6.5" width="2" height="5.5" rx="0.5" fill="currentColor" />
                </svg>
                <span>Chart</span>
            </button>
        </div>

        <div class="toolbar-sep" aria-hidden="true"></div>

        <div class="toolbar-group">
            <button class="tb has-label" title="Merge cells" @click="$emit('mergeCells')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2 8h12" stroke="currentColor" stroke-width="1.3" />
                    <path d="M6 3v5M10 3v5" stroke="currentColor" stroke-width="1.3" stroke-dasharray="1.8 1.2" />
                </svg>
                <span>Merge</span>
            </button>
            <button class="tb has-label" title="Unmerge cells" @click="$emit('unmergeCells')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2 8h12M6 3v10M10 3v10" stroke="currentColor" stroke-width="1.3" />
                </svg>
                <span>Unmerge</span>
            </button>
        </div>

        <div class="toolbar-sep" aria-hidden="true"></div>

        <!-- Cell type selector -->
        <div class="toolbar-group">
            <div ref="typeSelectorRef" class="type-selector-wrapper">
                <button
                    class="tb has-label type-selector-btn"
                    :disabled="!hasActiveCell"
                    title="Cell format type"
                    @click="toggleTypeMenu"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 3h10v2H3V3ZM3 7h6v2H3V7ZM3 11h8v2H3v-2Z" fill="currentColor" opacity="0.5" />
                        <path d="M12 8l2 3h-4l2-3Z" fill="currentColor" />
                    </svg>
                    <span>{{ currentTypeLabel }}</span>
                    <svg class="chevron" width="8" height="8" viewBox="0 0 8 8">
                        <path
                            d="M2 3l2 2 2-2"
                            stroke="currentColor"
                            stroke-width="1.2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            fill="none"
                        />
                    </svg>
                </button>
                <div v-if="typeMenuOpen" class="type-dropdown">
                    <button
                        v-for="opt in typeOptions"
                        :key="opt.value"
                        class="type-option"
                        :class="{ active: opt.value === currentCellType }"
                        @click="setType(opt.value)"
                    >
                        <span class="type-option-badge" :class="'badge-' + opt.value.replace('_', '-')">{{
                            opt.short
                        }}</span>
                        <span class="type-option-label">{{ opt.label }}</span>
                    </button>
                </div>
            </div>

            <!-- Decimal places controls -->
            <button
                class="tb decimal-btn"
                :disabled="!hasActiveCell || !supportsDecimals"
                title="Decrease decimal places"
                @click="changeDecimals(-1)"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <text x="1" y="12" font-size="9" font-weight="600" fill="currentColor">.0</text>
                    <path
                        d="M11 5l3 3-3 3"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                    <text x="9.5" y="12" font-size="7" font-weight="600" fill="currentColor">0</text>
                </svg>
            </button>
            <button
                class="tb decimal-btn"
                :disabled="!hasActiveCell || !supportsDecimals"
                title="Increase decimal places"
                @click="changeDecimals(1)"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <text x="1" y="12" font-size="9" font-weight="600" fill="currentColor">.00</text>
                    <path
                        d="M14 5l-3 3 3 3"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                    <text x="10" y="12" font-size="7" font-weight="600" fill="currentColor">0</text>
                </svg>
            </button>
        </div>

        <div class="toolbar-sep" aria-hidden="true"></div>

        <!-- Cell coloring -->
        <div class="toolbar-group">
            <!-- Text color -->
            <ColorPicker
                label="Text Color"
                clear-label="No color"
                :current-color="currentTextColor"
                :last-color="lastTextColor"
                :palette="colorPalette"
                :disabled="!hasActiveCell"
                :open="colorMenuType === 'text'"
                @apply="applyTextColor"
                @clear="clearTextColor"
                @update:open="(v: boolean) => (colorMenuType = v ? 'text' : null)"
            >
                <template #icon>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M4.5 12L8 3l3.5 9"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path d="M5.75 9h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                    </svg>
                </template>
            </ColorPicker>

            <!-- Fill color -->
            <ColorPicker
                label="Fill Color"
                clear-label="No fill"
                :current-color="currentFillColor"
                :last-color="lastFillColor"
                :palette="colorPalette"
                :disabled="!hasActiveCell"
                :open="colorMenuType === 'fill'"
                @apply="applyFillColor"
                @clear="clearFillColor"
                @update:open="(v: boolean) => (colorMenuType = v ? 'fill' : null)"
            >
                <template #icon>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3" />
                        <rect x="4" y="4" width="8" height="8" rx="1" :fill="lastFillColor" opacity="0.5" />
                    </svg>
                </template>
            </ColorPicker>
        </div>

        <!-- ═══ Formatting controls (shown for active cell OR text box) ═══ -->
        <template v-if="hasActiveCell || hasActiveTextBox">
            <div class="toolbar-sep" aria-hidden="true"></div>

            <!-- Font family picker -->
            <div class="toolbar-group">
                <div ref="fontSelectorRef" class="font-selector-wrapper">
                    <button class="tb has-label font-selector-btn" title="Font family" @click="toggleFontMenu">
                        <span
                            class="font-selector-label"
                            :style="{ fontFamily: fmtFontFamily !== 'System Default' ? fmtFontFamily : undefined }"
                            >{{ fmtFontFamily }}</span
                        >
                        <svg class="chevron" width="8" height="8" viewBox="0 0 8 8">
                            <path
                                d="M2 3l2 2 2-2"
                                stroke="currentColor"
                                stroke-width="1.2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                fill="none"
                            />
                        </svg>
                    </button>
                    <div v-if="fontMenuOpen" class="font-dropdown">
                        <button
                            v-for="font in fontOptions"
                            :key="font"
                            class="font-option"
                            :class="{ active: font === fmtFontFamily }"
                            :style="{ fontFamily: font !== 'System Default' ? font : undefined }"
                            @click="fmtSetFont(font)"
                        >
                            {{ font }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Font size (text box only) -->
            <template v-if="hasActiveTextBox">
                <div class="toolbar-sep" aria-hidden="true"></div>
                <div class="toolbar-group">
                    <button class="tb" title="Decrease font size" @click="tbDecreaseFontSize">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                        </svg>
                    </button>
                    <span class="tb-font-size">{{ activeTextBoxData?.fontSize ?? 14 }}</span>
                    <button class="tb" title="Increase font size" @click="tbIncreaseFontSize">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                        </svg>
                    </button>
                </div>
            </template>

            <div class="toolbar-sep" aria-hidden="true"></div>
            <div class="toolbar-group">
                <button class="tb" :class="{ 'tb-active': fmtIsBold }" title="Bold" @click="fmtToggleBold">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M4 2.5h4a2.5 2.5 0 0 1 0 5H4V2.5ZM4 7.5h4.5a2.5 2.5 0 0 1 0 5H4V7.5Z"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>
                <button class="tb" :class="{ 'tb-active': fmtIsItalic }" title="Italic" @click="fmtToggleItalic">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M9 2.5H6M8 11.5H5M8 2.5L6 11.5"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>
            </div>

            <div class="toolbar-sep" aria-hidden="true"></div>

            <!-- Alignment -->
            <div class="toolbar-group">
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'left' }"
                    title="Align Left"
                    @click="fmtSetAlign('left')"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M2 3h10M2 6h6M2 9h8M2 12h5"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'center' }"
                    title="Align Center"
                    @click="fmtSetAlign('center')"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M2 3h10M4 6h6M3 9h8M4.5 12h5"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'right' }"
                    title="Align Right"
                    @click="fmtSetAlign('right')"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                            d="M2 3h10M8 6h4M6 9h6M9 12h3"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
            </div>

            <!-- TextBox-specific: colors & border -->
            <template v-if="hasActiveTextBox">
                <div class="toolbar-sep" aria-hidden="true"></div>

                <!-- TextBox text color -->
                <div class="toolbar-group">
                    <ColorPicker
                        label="Text Color"
                        clear-label="No color"
                        :current-color="activeTextBoxData?.textColor"
                        :last-color="tbLastTextColor"
                        :palette="colorPalette"
                        :open="tbColorMenuType === 'tbText'"
                        @apply="tbApplyTextColor"
                        @clear="tbApplyTextColor('')"
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbText' : null)"
                    >
                        <template #icon>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path
                                    d="M4.5 12L8 3l3.5 9"
                                    stroke="currentColor"
                                    stroke-width="1.3"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path d="M5.75 9h4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                            </svg>
                        </template>
                    </ColorPicker>

                    <!-- TextBox fill color -->
                    <ColorPicker
                        label="Fill Color"
                        clear-label="No fill"
                        :current-color="activeTextBoxData?.bgColor"
                        :last-color="tbLastFillColor"
                        :palette="colorPalette"
                        :open="tbColorMenuType === 'tbFill'"
                        @apply="tbApplyFillColor"
                        @clear="tbApplyFillColor('')"
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbFill' : null)"
                    >
                        <template #icon>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <rect
                                    x="2.5"
                                    y="2.5"
                                    width="11"
                                    height="11"
                                    rx="2"
                                    stroke="currentColor"
                                    stroke-width="1.3"
                                />
                                <rect x="4" y="4" width="8" height="8" rx="1" :fill="tbLastFillColor" opacity="0.5" />
                            </svg>
                        </template>
                    </ColorPicker>
                </div>

                <div class="toolbar-sep" aria-hidden="true"></div>

                <!-- TextBox border -->
                <div class="toolbar-group">
                    <ColorPicker
                        label="Border"
                        clear-label="No border"
                        :current-color="activeTextBoxData?.borderColor"
                        :last-color="tbLastBorderColor"
                        :palette="colorPalette"
                        :show-custom-input="false"
                        :open="tbColorMenuType === 'tbBorder'"
                        @apply="tbApplyBorderColor"
                        @clear="
                            tbApplyBorderColor('');
                            tbUpdateProp('borderWidth', 0);
                        "
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbBorder' : null)"
                    >
                        <template #icon>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <rect
                                    x="2.5"
                                    y="2.5"
                                    width="11"
                                    height="11"
                                    rx="2"
                                    stroke="currentColor"
                                    stroke-width="1.3"
                                    stroke-dasharray="2.5 1.5"
                                />
                            </svg>
                        </template>
                        <template #extra>
                            <div class="color-custom-row">
                                <label class="color-custom-label">Width:</label>
                                <select
                                    class="tb-border-select"
                                    :value="activeTextBoxData?.borderWidth ?? 0"
                                    @change="
                                        tbUpdateProp('borderWidth', Number(($event.target as HTMLSelectElement).value))
                                    "
                                >
                                    <option value="0">None</option>
                                    <option value="1">1px</option>
                                    <option value="2">2px</option>
                                    <option value="3">3px</option>
                                    <option value="4">4px</option>
                                </select>
                            </div>
                            <div class="color-custom-row">
                                <label class="color-custom-label">Radius:</label>
                                <select
                                    class="tb-border-select"
                                    :value="activeTextBoxData?.borderRadius ?? 0"
                                    @change="
                                        tbUpdateProp('borderRadius', Number(($event.target as HTMLSelectElement).value))
                                    "
                                >
                                    <option value="0">0</option>
                                    <option value="4">4px</option>
                                    <option value="8">8px</option>
                                    <option value="12">12px</option>
                                    <option value="16">16px</option>
                                    <option value="24">24px</option>
                                </select>
                            </div>
                        </template>
                    </ColorPicker>
                </div>
            </template>
        </template>

        <div class="toolbar-spacer"></div>

        <div class="toolbar-group">
            <button class="tb theme-toggle" :title="isDark ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
                <!-- Sun icon (shown in dark mode) -->
                <svg v-if="isDark" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3" />
                    <path
                        d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                    />
                </svg>
                <!-- Moon icon (shown in light mode) -->
                <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7Z"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.toolbar {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    user-select: none;
    flex-shrink: 0;
    gap: 2px;
    overflow: visible;
    position: relative;
    z-index: 50;
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 1px;
}

.toolbar-sep {
    width: 1px;
    height: 16px;
    background: var(--border-color);
    margin: 0 6px;
    flex-shrink: 0;
}

.toolbar-spacer {
    flex: 1;
}

/* ── Toolbar button ── */

.tb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 30px;
    min-width: 30px;
    padding: 0 7px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
        background 0.12s,
        color 0.12s;
    -webkit-app-region: no-drag;

    svg {
        flex-shrink: 0;
    }

    &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    &:active {
        background: var(--bg-selected);
    }

    &.has-label {
        padding: 0 10px 0 7px;

        span {
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.01em;
        }
    }

    &.theme-toggle {
        margin-left: 2px;
    }
}

/* ── Type selector dropdown ── */

.decimal-btn {
    padding: 0 4px !important;
    min-width: 24px;
}

.type-selector-wrapper {
    position: relative;
}

.type-selector-btn {
    gap: 4px !important;

    .chevron {
        opacity: 0.5;
        margin-left: 1px;
    }
}

.type-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    padding: 4px;
    z-index: 100;
    min-width: 150px;
}

.type-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;

    &:hover {
        background: var(--bg-hover);
    }

    &.active {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
        font-weight: 600;
    }
}

.type-option-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    min-width: 26px;
    text-align: center;
    background: var(--bg-tertiary);
    color: var(--text-muted);

    &.badge-integer {
        background: rgba(59, 130, 246, 0.12);
        color: rgb(59, 130, 246);
    }
    &.badge-float {
        background: rgba(99, 102, 241, 0.12);
        color: rgb(99, 102, 241);
    }
    &.badge-currency-eur {
        background: rgba(16, 185, 129, 0.12);
        color: rgb(16, 185, 129);
    }
    &.badge-currency-usd {
        background: rgba(34, 197, 94, 0.12);
        color: rgb(34, 197, 94);
    }
    &.badge-text {
        background: rgba(245, 158, 11, 0.12);
        color: rgb(245, 158, 11);
    }
}

.type-option-label {
    flex: 1;
    text-align: left;
}

/* ── TextBox toolbar extras ── */

.tb-active {
    background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12)) !important;
    color: var(--accent-color) !important;
}

/* ── Font selector dropdown ── */

.font-selector-wrapper {
    position: relative;
}

.font-selector-btn {
    gap: 4px !important;
    max-width: 140px;

    .chevron {
        opacity: 0.5;
        margin-left: 1px;
        flex-shrink: 0;
    }
}

.font-selector-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 110px;
}

.font-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    padding: 4px;
    z-index: 200;
    min-width: 180px;
    max-height: 320px;
    overflow-y: auto;
}

.font-option {
    display: block;
    width: 100%;
    padding: 5px 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;

    &:hover {
        background: var(--bg-hover);
    }

    &.active {
        background: var(--accent-color-alpha, rgba(66, 133, 244, 0.12));
        font-weight: 600;
    }
}

.tb-font-size {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 26px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border-radius: 4px;
    padding: 0 4px;
    user-select: none;
}

// Slot content inside ColorPicker inherits parent scope
.color-custom-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border-color);
}

.color-custom-label {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 500;
}

.tb-border-select {
    flex: 1;
    height: 22px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 11px;
    padding: 0 4px;
    cursor: pointer;
    outline: none;

    &:focus {
        border-color: var(--accent-color);
    }
}
</style>
