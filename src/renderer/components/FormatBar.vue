<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

import IconAlignCenter from '@/renderer/components/icons/IconAlignCenter.vue';
import IconAlignLeft from '@/renderer/components/icons/IconAlignLeft.vue';
import IconAlignRight from '@/renderer/components/icons/IconAlignRight.vue';
import IconBold from '@/renderer/components/icons/IconBold.vue';
import IconBorder from '@/renderer/components/icons/IconBorder.vue';
import IconFillColor from '@/renderer/components/icons/IconFillColor.vue';
import IconFontSizeDown from '@/renderer/components/icons/IconFontSizeDown.vue';
import IconFontSizeUp from '@/renderer/components/icons/IconFontSizeUp.vue';
import IconItalic from '@/renderer/components/icons/IconItalic.vue';
import IconMergeCells from '@/renderer/components/icons/IconMergeCells.vue';
import IconTextColor from '@/renderer/components/icons/IconTextColor.vue';
import IconUnmergeCells from '@/renderer/components/icons/IconUnmergeCells.vue';
import { colorPalette } from '@/renderer/components/toolbar/colorPalette';
import ColorPicker from '@/renderer/components/toolbar/ColorPicker.vue';
import ToolbarFontPicker from '@/renderer/components/toolbar/ToolbarFontPicker.vue';
import ToolbarTypeSelector from '@/renderer/components/toolbar/ToolbarTypeSelector.vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import type { CellFormatUpdate, TextBox } from '@/renderer/types/spreadsheet';

type Align = 'left' | 'center' | 'right';

defineEmits<{
    mergeCells: [];
    unmergeCells: [];
}>();

const ALIGN_OPTIONS: { value: Align; title: string }[] = [
    { value: 'left', title: 'Align left' },
    { value: 'center', title: 'Align center' },
    { value: 'right', title: 'Align right' },
];
const DEFAULT_FONT_SIZE = 14;

const ss = injectSpreadsheet();

const textBox = computed((): TextBox | null =>
    ss.activeTextBoxId.value === null ? null : ss.findTextBox(ss.activeTextBoxId.value),
);
const hasActiveCell = computed((): boolean => ss.activeCell.value !== null);
const hasTarget = computed((): boolean => textBox.value !== null || hasActiveCell.value);

const isBold = computed((): boolean =>
    textBox.value === null ? (ss.findActiveCellFormat()?.bold ?? false) : textBox.value.fontWeight === 'bold',
);
const isItalic = computed((): boolean =>
    textBox.value === null ? (ss.findActiveCellFormat()?.italic ?? false) : textBox.value.fontStyle === 'italic',
);
const align = computed((): Align =>
    textBox.value === null ? (ss.findActiveCellFormat()?.align ?? 'left') : textBox.value.align,
);
const currentTextColor = computed((): string | undefined =>
    textBox.value === null ? ss.findActiveCellFormat()?.textColor : textBox.value.textColor,
);
const currentFillColor = computed((): string | undefined =>
    textBox.value === null ? ss.findActiveCellFormat()?.bgColor : textBox.value.bgColor,
);

const openMenu = ref<'text' | 'fill' | 'border' | null>(null);
const lastTextColor = ref('#000000');
const lastFillColor = ref('#FFEB3B');
const lastBorderColor = ref('#CCCCCC');

// One control, two kinds of object: a text box takes its own field names, and
// clears a colour with '' where a cell format drops the key.
function applyFormat(cellUpdate: CellFormatUpdate, boxUpdate: Partial<TextBox>): void {
    if (textBox.value !== null) ss.updateTextBox(textBox.value.id, boxUpdate);
    else if (hasActiveCell.value) ss.setSelectionFormat(cellUpdate);
}

function toggleBold(): void {
    applyFormat({ bold: !isBold.value }, { fontWeight: isBold.value ? 'normal' : 'bold' });
}

function toggleItalic(): void {
    applyFormat({ italic: !isItalic.value }, { fontStyle: isItalic.value ? 'normal' : 'italic' });
}

function setAlign(value: Align): void {
    applyFormat({ align: value }, { align: value });
}

function applyTextColor(color: string): void {
    applyFormat({ textColor: color }, { textColor: color });
    lastTextColor.value = color;
    openMenu.value = null;
}

function clearTextColor(): void {
    applyFormat({ textColor: undefined }, { textColor: '' });
    openMenu.value = null;
}

function applyFillColor(color: string): void {
    applyFormat({ bgColor: color }, { bgColor: color });
    lastFillColor.value = color;
    openMenu.value = null;
}

function clearFillColor(): void {
    applyFormat({ bgColor: undefined }, { bgColor: '' });
    openMenu.value = null;
}

function stepFontSize(step: number): void {
    const size = textBox.value?.fontSize ?? DEFAULT_FONT_SIZE;
    applyFormat({}, { fontSize: Math.min(Math.max(size + step, 8), 120) });
}

// A colour with no width would draw nothing, so picking one gives the border 1px.
function applyBorderColor(color: string): void {
    const width = textBox.value?.borderWidth ?? 0;
    applyFormat({}, { borderColor: color, ...(width === 0 ? { borderWidth: 1 } : {}) });
    lastBorderColor.value = color;
    openMenu.value = null;
}

function clearBorder(): void {
    applyFormat({}, { borderColor: '', borderWidth: 0 });
    openMenu.value = null;
}

// The border <select>s: each option's value is a size in pixels.
function onBorderSelect(prop: 'borderWidth' | 'borderRadius', e: Event): void {
    if (e.target instanceof HTMLSelectElement) applyFormat({}, { [prop]: Number(e.target.value) });
}

// ColorPicker stops its own clicks, so any click that reaches the document is outside it
function closeMenu(): void {
    openMenu.value = null;
}

onMounted((): void => document.addEventListener('click', closeMenu));
onBeforeUnmount((): void => document.removeEventListener('click', closeMenu));
</script>

<template>
    <div class="format-bar">
        <ToolbarFontPicker class="format-font" />

        <!-- Font size: cells use the interface size, so only a text box has one -->
        <template v-if="textBox !== null">
            <div
                class="toolbar-sep"
                aria-hidden="true"></div>
            <div class="toolbar-group">
                <button
                    class="tb"
                    title="Decrease font size"
                    aria-label="Decrease font size"
                    @click="stepFontSize(-2)">
                    <IconFontSizeDown
                        width="16"
                        height="16" />
                </button>
                <span class="tb-font-size">{{ textBox.fontSize }}</span>
                <button
                    class="tb"
                    title="Increase font size"
                    aria-label="Increase font size"
                    @click="stepFontSize(2)">
                    <IconFontSizeUp
                        width="16"
                        height="16" />
                </button>
            </div>
        </template>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>
        <div class="toolbar-group">
            <button
                class="tb"
                :class="{ 'tb-active': isBold }"
                :aria-pressed="isBold"
                :disabled="!hasTarget"
                title="Bold"
                aria-label="Bold"
                @click="toggleBold">
                <IconBold
                    width="16"
                    height="16" />
            </button>
            <button
                class="tb"
                :class="{ 'tb-active': isItalic }"
                :aria-pressed="isItalic"
                :disabled="!hasTarget"
                title="Italic"
                aria-label="Italic"
                @click="toggleItalic">
                <IconItalic
                    width="16"
                    height="16" />
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>
        <div class="toolbar-group">
            <button
                v-for="option in ALIGN_OPTIONS"
                :key="option.value"
                class="tb"
                :class="{ 'tb-active': hasTarget && align === option.value }"
                :aria-pressed="hasTarget && align === option.value"
                :disabled="!hasTarget"
                :title="option.title"
                :aria-label="option.title"
                @click="setAlign(option.value)">
                <IconAlignLeft
                    v-if="option.value === 'left'"
                    width="16"
                    height="16" />
                <IconAlignCenter
                    v-else-if="option.value === 'center'"
                    width="16"
                    height="16" />
                <IconAlignRight
                    v-else
                    width="16"
                    height="16" />
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>
        <div class="toolbar-group">
            <ColorPicker
                label="Text color"
                clear-label="No color"
                :current-color="currentTextColor"
                :last-color="lastTextColor"
                :palette="colorPalette"
                :disabled="!hasTarget"
                :open="openMenu === 'text'"
                @apply="applyTextColor"
                @clear="clearTextColor"
                @update:open="(open: boolean) => (openMenu = open ? 'text' : null)">
                <template #icon>
                    <IconTextColor
                        width="16"
                        height="16" />
                </template>
            </ColorPicker>
            <ColorPicker
                label="Fill color"
                clear-label="No fill"
                :current-color="currentFillColor"
                :last-color="lastFillColor"
                :palette="colorPalette"
                :disabled="!hasTarget"
                :open="openMenu === 'fill'"
                @apply="applyFillColor"
                @clear="clearFillColor"
                @update:open="(open: boolean) => (openMenu = open ? 'fill' : null)">
                <template #icon>
                    <IconFillColor
                        :swatch="hasTarget ? lastFillColor : 'none'"
                        width="16"
                        height="16" />
                </template>
            </ColorPicker>
        </div>

        <!-- Text box border -->
        <template v-if="textBox !== null">
            <div
                class="toolbar-sep"
                aria-hidden="true"></div>
            <div class="toolbar-group">
                <ColorPicker
                    label="Border"
                    clear-label="No border"
                    :current-color="textBox.borderColor"
                    :last-color="lastBorderColor"
                    :palette="colorPalette"
                    :show-custom-input="false"
                    :open="openMenu === 'border'"
                    @apply="applyBorderColor"
                    @clear="clearBorder"
                    @update:open="(open: boolean) => (openMenu = open ? 'border' : null)">
                    <template #icon>
                        <IconBorder
                            width="16"
                            height="16" />
                    </template>
                    <template #extra>
                        <div class="color-custom-row">
                            <label
                                class="color-custom-label"
                                for="tb-border-width"
                                >Width:</label
                            >
                            <select
                                id="tb-border-width"
                                class="tb-border-select"
                                :value="textBox.borderWidth"
                                @change="onBorderSelect('borderWidth', $event)">
                                <option value="0">None</option>
                                <option value="1">1px</option>
                                <option value="2">2px</option>
                                <option value="3">3px</option>
                                <option value="4">4px</option>
                            </select>
                        </div>
                        <div class="color-custom-row">
                            <label
                                class="color-custom-label"
                                for="tb-border-radius"
                                >Radius:</label
                            >
                            <select
                                id="tb-border-radius"
                                class="tb-border-select"
                                :value="textBox.borderRadius"
                                @change="onBorderSelect('borderRadius', $event)">
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

        <!-- Cell-only controls -->
        <template v-else>
            <div
                class="toolbar-sep"
                aria-hidden="true"></div>
            <ToolbarTypeSelector />
            <div
                class="toolbar-sep"
                aria-hidden="true"></div>
            <div class="toolbar-group">
                <button
                    class="tb"
                    :disabled="!hasActiveCell"
                    title="Merge cells"
                    aria-label="Merge cells"
                    @click="$emit('mergeCells')">
                    <IconMergeCells
                        width="16"
                        height="16" />
                </button>
                <button
                    class="tb"
                    :disabled="!hasActiveCell"
                    title="Unmerge cells"
                    aria-label="Unmerge cells"
                    @click="$emit('unmergeCells')">
                    <IconUnmergeCells
                        width="16"
                        height="16" />
                </button>
            </div>
        </template>
    </div>
</template>

<style scoped lang="scss">
/* ––– Format bar ––– */

.format-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: $size-20;
    padding: 0 $space-3;
    background: $color-bg-chrome;
    border-bottom: $border-width-thin $color-border;
    flex-shrink: 0;
    position: relative;
    z-index: $z-dropdown;
    user-select: none;
}

/* ––– Font picker ––– */

.format-font {
    flex: 1 1 $size-22;
    min-width: 0;
    max-width: $size-26;
}

/* ––– Text box extras ––– */

.tb-font-size {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: $size-17;
    height: $size-16;
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    color: $color-text;
    font-variant-numeric: tabular-nums;
}

.tb-border-select {
    flex: 1;
    height: $size-14;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-sm;
    background: $color-bg-surface;
    color: $color-text;
    font-size: $font-size-sm;
    padding: 0 $space-1;
    cursor: pointer;
    outline: none;

    &:focus {
        border-color: $color-accent;
    }
}
</style>
