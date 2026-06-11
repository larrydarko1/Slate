<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { SPREADSHEET_KEY } from '../../composables/useSpreadsheet';

const ss = inject(SPREADSHEET_KEY)!;

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

const hasActiveTextBox = computed(() => !!ss.activeTextBoxId.value);
const hasActiveCell = computed(() => !!ss.activeCell.value);

const activeTextBoxData = computed(() => {
    if (!ss.activeTextBoxId.value) return null;
    return ss.findTextBox(ss.activeTextBoxId.value) ?? null;
});

const fmtFontFamily = computed(() => {
    if (hasActiveTextBox.value) return activeTextBoxData.value?.fontFamily ?? 'System Default';
    const fmt = ss.getActiveCellFormat();
    return fmt?.fontFamily ?? 'System Default';
});

function toggleFontMenu(): void {
    fontMenuOpen.value = !fontMenuOpen.value;
}

function fmtSetFont(font: string): void {
    if (hasActiveTextBox.value) {
        const id = ss.activeTextBoxId.value;
        if (id) ss.updateTextBox(id, { fontFamily: font });
    } else if (hasActiveCell.value) {
        ss.setSelectionFormat({ fontFamily: font === 'System Default' ? undefined : font });
    }
    fontMenuOpen.value = false;
}

function onClickOutside(e: MouseEvent): void {
    if (fontMenuOpen.value && fontSelectorRef.value && !fontSelectorRef.value.contains(e.target as Node)) {
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
.toolbar-group {
    display: flex;
    align-items: center;
    gap: 1px;
}

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
    color: $text-muted;
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
        background: $bg-hover;
        color: $text-primary;
    }

    &:active {
        background: $bg-selected;
    }

    &.has-label {
        padding: 0 10px 0 7px;

        span {
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.01em;
        }
    }
}

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
    background: $bg-primary;
    border: 1px solid $border-color;
    border-radius: 8px;
    box-shadow: $shadow-lg;
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
    color: $text-primary;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    white-space: nowrap;

    &:hover {
        background: $bg-hover;
    }

    &.active {
        background: $accent-color-alpha;
        font-weight: 600;
    }
}
</style>
