<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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

const fontSelectorRef = ref<HTMLElement | null>(null);
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
    if (fontMenuOpen.value && fontSelectorRef.value !== null && !fontSelectorRef.value.contains(e.target as Node)) {
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
                <svg
                    class="chevron"
                    width="8"
                    height="8"
                    viewBox="0 0 8 8">
                    <path
                        d="M2 3l2 2 2-2"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        fill="none" />
                </svg>
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
    gap: $space-3;
    max-width: $size-23;

    .chevron {
        opacity: $opacity-mid;
        margin-left: $space-0;
        flex-shrink: 0;
    }
}

.font-selector-label {
    @include truncate;

    max-width: $size-24;
}

.font-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: $space-3;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-lg;
    padding: $space-3;
    z-index: $z-popover;
    min-width: $size-24;
    max-height: $size-34;
    overflow-y: auto;
}

.font-option {
    display: block;
    width: 100%;
    padding: $space-4 $space-9;
    border: none;
    border-radius: $border-radius;
    background: transparent;
    color: $text-primary;
    font-size: $font-size-md;
    text-align: left;
    cursor: pointer;
    transition: background $duration-quick;
    white-space: nowrap;

    &:hover {
        background: $bg-hover;
    }

    &.active {
        background: $accent-color-alpha;
        font-weight: $font-weight-semibold;
    }
}
</style>
