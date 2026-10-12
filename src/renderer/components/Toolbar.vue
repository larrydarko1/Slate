<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

import IconAlignCenter from '@/renderer/components/icons/IconAlignCenter.vue';
import IconAlignLeft from '@/renderer/components/icons/IconAlignLeft.vue';
import IconAlignRight from '@/renderer/components/icons/IconAlignRight.vue';
import IconBold from '@/renderer/components/icons/IconBold.vue';
import IconBorder from '@/renderer/components/icons/IconBorder.vue';
import IconChart from '@/renderer/components/icons/IconChart.vue';
import IconFileNew from '@/renderer/components/icons/IconFileNew.vue';
import IconFolderOpen from '@/renderer/components/icons/IconFolderOpen.vue';
import IconFontSizeDown from '@/renderer/components/icons/IconFontSizeDown.vue';
import IconFontSizeUp from '@/renderer/components/icons/IconFontSizeUp.vue';
import IconItalic from '@/renderer/components/icons/IconItalic.vue';
import IconMergeCells from '@/renderer/components/icons/IconMergeCells.vue';
import IconMoon from '@/renderer/components/icons/IconMoon.vue';
import IconSave from '@/renderer/components/icons/IconSave.vue';
import IconSlateLogo from '@/renderer/components/icons/IconSlateLogo.vue';
import IconSun from '@/renderer/components/icons/IconSun.vue';
import IconTable from '@/renderer/components/icons/IconTable.vue';
import IconTextBox from '@/renderer/components/icons/IconTextBox.vue';
import IconTextColor from '@/renderer/components/icons/IconTextColor.vue';
import IconUnmergeCells from '@/renderer/components/icons/IconUnmergeCells.vue';
import { colorPalette } from '@/renderer/components/toolbar/colorPalette';
import ColorPicker from '@/renderer/components/toolbar/ColorPicker.vue';
import ToolbarFontPicker from '@/renderer/components/toolbar/ToolbarFontPicker.vue';
import ToolbarTypeSelector from '@/renderer/components/toolbar/ToolbarTypeSelector.vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import type { TextBox } from '@/renderer/types/spreadsheet';

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

const ss = injectSpreadsheet();

// ── TextBox formatting ──––––––––––––––––––––––––––––––––––––––––––––––––––––––

const hasActiveTextBox = computed((): boolean => ss.activeTextBoxId.value !== null);

const activeTextBoxData = computed((): TextBox | null => {
    if (ss.activeTextBoxId.value === null) return null;
    return ss.findTextBox(ss.activeTextBoxId.value);
});

const tbColorMenuType = ref<'tbText' | 'tbFill' | 'tbBorder' | null>(null);
const tbLastTextColor = ref('#000000');
const tbLastFillColor = ref('#FFFFFF');
const tbLastBorderColor = ref('#CCCCCC');

// ── Unified formatting (works for both cells and text boxes) ──––––––––––––––––––

const fmtIsBold = computed((): boolean => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontWeight === 'bold';
    const fmt = ss.findActiveCellFormat();
    return fmt?.bold ?? false;
});

const fmtIsItalic = computed((): boolean => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontStyle === 'italic';
    const fmt = ss.findActiveCellFormat();
    return fmt?.italic ?? false;
});

const fmtAlign = computed<'left' | 'center' | 'right'>((): 'left' | 'center' | 'right' => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.align ?? 'left';
    const fmt = ss.findActiveCellFormat();
    return fmt?.align ?? 'left';
});

// ── Type selector ──––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const hasActiveCell = computed((): boolean => !(ss.activeCell.value === null));

// ── Cell coloring ──––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const colorMenuType = ref<'text' | 'fill' | null>(null);
const lastTextColor = ref('#000000');
const lastFillColor = ref('#FFEB3B');
const isDark = ref(false);

const currentTextColor = computed((): string | null => {
    const fmt = ss.findActiveCellFormat();
    return fmt?.textColor ?? null;
});

const currentFillColor = computed((): string | null => {
    const fmt = ss.findActiveCellFormat();
    return fmt?.bgColor ?? null;
});

function applyTextColor(color: string): void {
    ss.setSelectionFormat({ textColor: color });
    lastTextColor.value = color;
    colorMenuType.value = null;
}

function applyFillColor(color: string): void {
    ss.setSelectionFormat({ bgColor: color });
    lastFillColor.value = color;
    colorMenuType.value = null;
}

function clearTextColor(): void {
    ss.setSelectionFormat({ textColor: undefined });
    colorMenuType.value = null;
}

function clearFillColor(): void {
    ss.setSelectionFormat({ bgColor: undefined });
    colorMenuType.value = null;
}

function onClickOutside(): void {
    // ColorPicker uses @click.stop internally, so any click reaching here is outside
    colorMenuType.value = null;
    tbColorMenuType.value = null;
}

function toggleTheme(): void {
    isDark.value = !isDark.value;
    applyTheme();
    localStorage.setItem('slate-theme', isDark.value ? 'dark' : 'light');
}

function applyTheme(): void {
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

function tbUpdateProp<TKey extends keyof TextBox>(prop: TKey, value: TextBox[TKey]): void {
    const id = ss.activeTextBoxId.value;
    if (id === null) return;
    ss.updateTextBox(id, { [prop]: value });
}

// The border <select>s: each option's value is a size in pixels.
function onBorderSelect(prop: 'borderWidth' | 'borderRadius', e: Event): void {
    if (e.target instanceof HTMLSelectElement) tbUpdateProp(prop, Number(e.target.value));
}

function tbToggleBold(): void {
    const current = activeTextBoxData.value?.fontWeight ?? 'normal';
    tbUpdateProp('fontWeight', current === 'bold' ? 'normal' : 'bold');
}

function tbToggleItalic(): void {
    const current = activeTextBoxData.value?.fontStyle ?? 'normal';
    tbUpdateProp('fontStyle', current === 'italic' ? 'normal' : 'italic');
}

function tbSetAlign(a: 'left' | 'center' | 'right'): void {
    tbUpdateProp('align', a);
}

function tbIncreaseFontSize(): void {
    const size = activeTextBoxData.value?.fontSize ?? 14;
    tbUpdateProp('fontSize', Math.min(size + 2, 120));
}

function tbDecreaseFontSize(): void {
    const size = activeTextBoxData.value?.fontSize ?? 14;
    tbUpdateProp('fontSize', Math.max(size - 2, 8));
}

function tbApplyTextColor(color: string): void {
    tbUpdateProp('textColor', color);
    if (color !== '') tbLastTextColor.value = color;
    tbColorMenuType.value = null;
}

function tbApplyFillColor(color: string): void {
    tbUpdateProp('bgColor', color);
    if (color !== '') tbLastFillColor.value = color;
    tbColorMenuType.value = null;
}

function tbApplyBorderColor(color: string): void {
    tbUpdateProp('borderColor', color);
    if (color !== '') {
        tbLastBorderColor.value = color;
        // auto-set borderWidth to 1 if not set
        if ((activeTextBoxData.value?.borderWidth ?? 0) === 0) tbUpdateProp('borderWidth', 1);
    }
    tbColorMenuType.value = null;
}

function fmtToggleBold(): void {
    if (hasActiveTextBox.value) {
        tbToggleBold();
    } else if (hasActiveCell.value) {
        const current = ss.findActiveCellFormat()?.bold ?? false;
        ss.setSelectionFormat({ bold: !current });
    }
}

function fmtToggleItalic(): void {
    if (hasActiveTextBox.value) {
        tbToggleItalic();
    } else if (hasActiveCell.value) {
        const current = ss.findActiveCellFormat()?.italic ?? false;
        ss.setSelectionFormat({ italic: !current });
    }
}

function fmtSetAlign(a: 'left' | 'center' | 'right'): void {
    if (hasActiveTextBox.value) {
        tbSetAlign(a);
    } else if (hasActiveCell.value) {
        ss.setSelectionFormat({ align: a });
    }
}
// ── Theme ──–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––-

onMounted((): void => {
    const saved = localStorage.getItem('slate-theme');
    if (saved !== null) {
        isDark.value = saved === 'dark';
    } else {
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme();
    document.addEventListener('click', onClickOutside);
});

onBeforeUnmount((): void => {
    document.removeEventListener('click', onClickOutside);
});
</script>

<template>
    <div class="toolbar">
        <div class="toolbar-logo">
            <IconSlateLogo />
        </div>
        <div
            class="toolbar-sep"
            aria-hidden="true"></div>
        <div class="toolbar-group">
            <button
                class="tb has-label"
                title="New (⌘N)"
                @click="$emit('newFile')">
                <IconFileNew
                    width="16"
                    height="16" />
                <span>New</span>
            </button>
            <button
                class="tb has-label"
                title="Open (⌘O)"
                @click="$emit('openFile')">
                <IconFolderOpen
                    width="16"
                    height="16" />
                <span>Open</span>
            </button>
            <button
                class="tb has-label"
                title="Save (⌘S)"
                @click="$emit('saveFile')">
                <IconSave
                    width="16"
                    height="16" />
                <span>Save</span>
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>

        <div class="toolbar-group">
            <button
                class="tb has-label"
                title="Add Table"
                @click="$emit('addTable')">
                <IconTable
                    width="16"
                    height="16" />
                <span>Table</span>
            </button>
            <button
                class="tb has-label"
                title="Add Text Box"
                @click="$emit('addTextBox')">
                <IconTextBox
                    width="16"
                    height="16" />
                <span>Text</span>
            </button>
            <button
                class="tb has-label"
                title="Add Chart"
                @click="$emit('addChart')">
                <IconChart
                    width="16"
                    height="16" />
                <span>Chart</span>
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>

        <div class="toolbar-group">
            <button
                class="tb has-label"
                title="Merge cells"
                @click="$emit('mergeCells')">
                <IconMergeCells
                    width="16"
                    height="16" />
                <span>Merge</span>
            </button>
            <button
                class="tb has-label"
                title="Unmerge cells"
                @click="$emit('unmergeCells')">
                <IconUnmergeCells
                    width="16"
                    height="16" />
                <span>Unmerge</span>
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>

        <!-- Cell type selector -->
        <ToolbarTypeSelector />
        <div
            class="toolbar-sep"
            aria-hidden="true"></div>

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
                @update:open="(v: boolean) => (colorMenuType = v ? 'text' : null)">
                <template #icon>
                    <IconTextColor
                        width="16"
                        height="16" />
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
                @update:open="(v: boolean) => (colorMenuType = v ? 'fill' : null)">
                <template #icon>
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none">
                        <rect
                            x="2.5"
                            y="2.5"
                            width="11"
                            height="11"
                            rx="2"
                            stroke="currentColor"
                            stroke-width="1.3" />
                        <rect
                            x="4"
                            y="4"
                            width="8"
                            height="8"
                            rx="1"
                            :fill="lastFillColor"
                            opacity="0.5" />
                    </svg>
                </template>
            </ColorPicker>
        </div>

        <!-- ═══ Formatting controls (shown for active cell OR text box) ═══ -->
        <template v-if="hasActiveCell || hasActiveTextBox">
            <div
                class="toolbar-sep"
                aria-hidden="true"></div>

            <!-- Font family picker -->
            <ToolbarFontPicker />

            <!-- Font size (text box only) -->
            <template v-if="hasActiveTextBox">
                <div
                    class="toolbar-sep"
                    aria-hidden="true"></div>
                <div class="toolbar-group">
                    <button
                        class="tb"
                        title="Decrease font size"
                        @click="tbDecreaseFontSize">
                        <IconFontSizeDown
                            width="14"
                            height="14" />
                    </button>
                    <span class="tb-font-size">{{ activeTextBoxData?.fontSize ?? 14 }}</span>
                    <button
                        class="tb"
                        title="Increase font size"
                        @click="tbIncreaseFontSize">
                        <IconFontSizeUp
                            width="14"
                            height="14" />
                    </button>
                </div>
            </template>

            <div
                class="toolbar-sep"
                aria-hidden="true"></div>
            <div class="toolbar-group">
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtIsBold }"
                    title="Bold"
                    @click="fmtToggleBold">
                    <IconBold
                        width="14"
                        height="14" />
                </button>
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtIsItalic }"
                    title="Italic"
                    @click="fmtToggleItalic">
                    <IconItalic
                        width="14"
                        height="14" />
                </button>
            </div>

            <div
                class="toolbar-sep"
                aria-hidden="true"></div>

            <!-- Alignment -->
            <div class="toolbar-group">
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'left' }"
                    title="Align Left"
                    @click="fmtSetAlign('left')">
                    <IconAlignLeft
                        width="14"
                        height="14" />
                </button>
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'center' }"
                    title="Align Center"
                    @click="fmtSetAlign('center')">
                    <IconAlignCenter
                        width="14"
                        height="14" />
                </button>
                <button
                    class="tb"
                    :class="{ 'tb-active': fmtAlign === 'right' }"
                    title="Align Right"
                    @click="fmtSetAlign('right')">
                    <IconAlignRight
                        width="14"
                        height="14" />
                </button>
            </div>

            <!-- TextBox-specific: colors & border -->
            <template v-if="hasActiveTextBox">
                <div
                    class="toolbar-sep"
                    aria-hidden="true"></div>

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
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbText' : null)">
                        <template #icon>
                            <IconTextColor
                                width="16"
                                height="16" />
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
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbFill' : null)">
                        <template #icon>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none">
                                <rect
                                    x="2.5"
                                    y="2.5"
                                    width="11"
                                    height="11"
                                    rx="2"
                                    stroke="currentColor"
                                    stroke-width="1.3" />
                                <rect
                                    x="4"
                                    y="4"
                                    width="8"
                                    height="8"
                                    rx="1"
                                    :fill="tbLastFillColor"
                                    opacity="0.5" />
                            </svg>
                        </template>
                    </ColorPicker>
                </div>

                <div
                    class="toolbar-sep"
                    aria-hidden="true"></div>

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
                        @update:open="(v: boolean) => (tbColorMenuType = v ? 'tbBorder' : null)">
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
                                    :value="activeTextBoxData?.borderWidth ?? 0"
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
                                    :value="activeTextBoxData?.borderRadius ?? 0"
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
        </template>

        <div class="toolbar-spacer"></div>
        <div class="toolbar-group">
            <button
                class="tb theme-toggle"
                :title="isDark ? 'Light mode' : 'Dark mode'"
                @click="toggleTheme">
                <!-- Sun icon (shown in dark mode) -->
                <IconSun
                    v-if="isDark"
                    width="16"
                    height="16" />
                <!-- Moon icon (shown in light mode) -->
                <IconMoon
                    v-else
                    width="16"
                    height="16" />
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.toolbar {
    display: flex;
    align-items: center;
    height: $size-21;
    padding: 0 $space-9;
    background: $bg-primary;
    border-bottom: $border-width-thin $border-color;
    user-select: none;
    flex-shrink: 0;
    gap: $space-1;
    overflow: visible;
    position: relative;
    z-index: $z-dropdown;
}

.toolbar-sep {
    width: $size-0;
    height: $size-11;
    background: $border-color;
    margin: 0 $space-5;
    flex-shrink: 0;
}

.toolbar-spacer {
    flex: 1;
}

/* ––––– Logo ––––– */

.toolbar-logo {
    display: flex;
    align-items: center;
    padding: 0 $space-3;
    flex-shrink: 0;
    color: $text-primary;
    opacity: $opacity-mid;
    -webkit-app-region: no-drag;

    svg {
        height: $size-21;
        width: auto;
        display: block;
    }
}

/* ––––– Toolbar button ––––– */

/* ––––– TextBox toolbar extras ––––– */

.tb-font-size {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: $size-17;
    height: $size-16;
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    background: $bg-tertiary;
    border-radius: $border-radius-sm;
    padding: 0 $space-3;
    user-select: none;
}

.tb-border-select {
    flex: 1;
    height: $size-14;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-sm;
    background: $bg-primary;
    color: $text-primary;
    font-size: $font-size-sm;
    padding: 0 $space-3;
    cursor: pointer;
    outline: none;

    &:focus {
        border-color: $accent-color;
    }
}
</style>
