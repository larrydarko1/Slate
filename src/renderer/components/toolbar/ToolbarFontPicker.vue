<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';

import IconChevronDown from '@/renderer/components/icons/IconChevronDown.vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';

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

const ss = injectSpreadsheet();

const fontSelectorRef = useTemplateRef<HTMLElement>('fontSelectorRef');
const fontMenuOpen = ref(false);

const hasActiveTextBox = computed((): boolean => ss.activeTextBoxId.value !== null);
const hasActiveCell = computed((): boolean => ss.activeCell.value !== null);

const activeTextBoxData = computed(() => {
    if (ss.activeTextBoxId.value === null) return null;
    return ss.findTextBox(ss.activeTextBoxId.value);
});

const fmtFontFamily = computed(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontFamily ?? 'System Default';
    const fmt = ss.findActiveCellFormat();
    return fmt?.fontFamily ?? 'System Default';
});

function toggleFontMenu(): void {
    fontMenuOpen.value = !fontMenuOpen.value;
}

function fmtSetFont(font: string): void {
    if (hasActiveTextBox.value) {
        const id = ss.activeTextBoxId.value;
        if (id !== null) ss.updateTextBox(id, { fontFamily: font });
    } else if (hasActiveCell.value) {
        ss.setSelectionFormat({ fontFamily: font === 'System Default' ? undefined : font });
    }
    fontMenuOpen.value = false;
}

function onClickOutside(e: MouseEvent): void {
    if (
        fontMenuOpen.value &&
        fontSelectorRef.value !== null &&
        !(e.target instanceof Node && fontSelectorRef.value.contains(e.target))
    ) {
        fontMenuOpen.value = false;
    }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));
</script>

<template>
    <div class="toolbar-group">
        <div
            ref="fontSelectorRef"
            class="font-selector-wrapper">
            <button
                class="tb has-label font-selector-btn"
                title="Font family"
                @click="toggleFontMenu">
                <span
                    class="font-selector-label"
                    :style="{ fontFamily: fmtFontFamily !== 'System Default' ? fmtFontFamily : undefined }"
                    >{{ fmtFontFamily }}</span
                >
                <IconChevronDown
                    class="chevron"
                    width="8"
                    height="8" />
            </button>
            <div
                v-if="fontMenuOpen"
                class="font-dropdown">
                <button
                    v-for="font in fontOptions"
                    :key="font"
                    class="font-option"
                    :class="{ active: font === fmtFontFamily }"
                    :style="{ fontFamily: font !== 'System Default' ? font : undefined }"
                    @click="fmtSetFont(font)">
                    {{ font }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.font-selector-wrapper {
    position: relative;
}

.font-selector-btn {
    gap: $space-1;
    max-width: $size-26;

    .chevron {
        opacity: $opacity-mid;
        margin-left: $space-0;
        flex-shrink: 0;
    }
}

.font-selector-label {
    @include truncate;

    min-width: 0;
}

.font-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: $space-1;
    background: $color-bg-elevated;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-popover;
    padding: $space-1;
    z-index: $z-popover;
    min-width: $size-24;
    max-height: $size-34;
    overflow-y: auto;
}

.font-option {
    display: block;
    width: 100%;
    padding: $space-1 $space-2;
    border: none;
    border-radius: $border-radius-md;
    background: transparent;
    color: $color-text;
    font-size: $font-size-base;
    text-align: left;
    cursor: pointer;
    transition: background $duration-quick;
    white-space: nowrap;

    &:hover {
        background: $color-bg-hover;
    }

    &.active {
        background: $color-accent-subtle;
        font-weight: $font-weight-semibold;
    }
}
</style>
