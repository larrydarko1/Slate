<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { getTypeLabel } from '@/renderer/composables/spreadsheet/engine/cellTypes';

const typeOptions: { value: CellDataType; label: string; short: string }[] = [
    { value: 'text', label: 'Text', short: 'ABC' },
    { value: 'integer', label: 'Integer', short: '123' },
    { value: 'float', label: 'Decimal', short: '1.2' },
    { value: 'percent', label: 'Percent (%)', short: '%' },
    { value: 'currency_usd', label: 'Dollar ($)', short: '$' },
    { value: 'currency_eur', label: 'Euro (€)', short: '€' },
];

const ss = injectSpreadsheet();

const typeSelectorRef = ref<HTMLElement | null>(null);
const typeMenuOpen = ref(false);

const hasActiveCell = computed(() => !(ss.activeCell.value === null));

const currentCellType = computed<CellDataType>(() => {
    if (ss.activeCell.value === null) return 'text';
    return ss.getCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row);
});

const supportsDecimals = computed(() => {
    const cellType = currentCellType.value;
    return cellType === 'float' || cellType === 'percent' || cellType === 'currency_eur' || cellType === 'currency_usd';
});

const currentTypeLabel = computed(() => {
    const opt = typeOptions.find((o) => o.value === currentCellType.value);
    return opt !== undefined ? opt.short : getTypeLabel(currentCellType.value);
});

function changeDecimals(delta: number): void {
    if (ss.activeCell.value === null) return;
    const fmt = ss.findActiveCellFormat();
    const current = fmt?.decimalPlaces ?? 2;
    const next = Math.max(0, Math.min(10, current + delta));
    ss.setSelectionFormat({ decimalPlaces: next });
}

function toggleTypeMenu(): void {
    typeMenuOpen.value = !typeMenuOpen.value;
}

function setType(t: CellDataType): void {
    if (ss.activeCell.value === null) return;
    ss.setCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row, t);
    typeMenuOpen.value = false;
}

function onClickOutside(e: MouseEvent): void {
    if (typeMenuOpen.value && typeSelectorRef.value !== null && !typeSelectorRef.value.contains(e.target as Node)) {
        typeMenuOpen.value = false;
    }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));
</script>

<template>
    <div class="toolbar-group">
        <div
            ref="typeSelectorRef"
            class="type-selector-wrapper">
            <button
                class="tb has-label type-selector-btn"
                :disabled="!hasActiveCell"
                title="Cell format type"
                @click="toggleTypeMenu">
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none">
                    <path
                        d="M3 3h10v2H3V3ZM3 7h6v2H3V7ZM3 11h8v2H3v-2Z"
                        fill="currentColor"
                        opacity="0.5" />
                    <path
                        d="M12 8l2 3h-4l2-3Z"
                        fill="currentColor" />
                </svg>
                <span>{{ currentTypeLabel }}</span>
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
                v-if="typeMenuOpen"
                class="type-dropdown">
                <button
                    v-for="opt in typeOptions"
                    :key="opt.value"
                    class="type-option"
                    :class="{ active: opt.value === currentCellType }"
                    @click="setType(opt.value)">
                    <span
                        class="type-option-badge"
                        :class="'badge-' + opt.value.replace('_', '-')"
                        >{{ opt.short }}</span
                    >
                    <span class="type-option-label">{{ opt.label }}</span>
                </button>
            </div>
        </div>

        <!-- Decimal places controls -->
        <button
            class="tb decimal-btn"
            :disabled="!hasActiveCell || !supportsDecimals"
            title="Decrease decimal places"
            @click="changeDecimals(-1)">
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none">
                <text
                    x="1"
                    y="12"
                    font-size="9"
                    font-weight="600"
                    fill="currentColor">
                    .0
                </text>
                <path
                    d="M11 5l3 3-3 3"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round" />
                <text
                    x="9.5"
                    y="12"
                    font-size="7"
                    font-weight="600"
                    fill="currentColor">
                    0
                </text>
            </svg>
        </button>
        <button
            class="tb decimal-btn"
            :disabled="!hasActiveCell || !supportsDecimals"
            title="Increase decimal places"
            @click="changeDecimals(1)">
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none">
                <text
                    x="1"
                    y="12"
                    font-size="9"
                    font-weight="600"
                    fill="currentColor">
                    .00
                </text>
                <path
                    d="M14 5l-3 3 3 3"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round" />
                <text
                    x="10"
                    y="12"
                    font-size="7"
                    font-weight="600"
                    fill="currentColor">
                    0
                </text>
            </svg>
        </button>
    </div>
</template>

<style scoped lang="scss">
.decimal-btn {
    padding: 0 $space-3;
    min-width: $size-15;
}

.type-selector-wrapper {
    position: relative;
}

.type-selector-btn {
    gap: $space-3;

    .chevron {
        opacity: $opacity-mid;
        margin-left: $space-0;
    }
}

.type-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: $space-3;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-lg;
    padding: $space-3;
    z-index: $z-overlay;
    min-width: $size-27;
}

.type-option {
    display: flex;
    align-items: center;
    gap: $space-7;
    width: 100%;
    padding: $space-4 $space-7;
    border: none;
    border-radius: $border-radius;
    background: transparent;
    color: $text-primary;
    font-size: $font-size-base;
    cursor: pointer;
    transition: background $duration-quick;

    &:hover {
        background: $bg-hover;
    }

    &.active {
        background: $accent-color-alpha;
        font-weight: $font-weight-semibold;
    }
}

.type-option-badge {
    font-size: $font-size-2xs;
    font-weight: $font-weight-bold;
    padding: $space-0 $space-4;
    border-radius: $border-radius-xs;
    min-width: $size-16;
    text-align: center;
    background: $bg-tertiary;
    color: $text-muted;

    &.badge-integer {
        background: $type-text-alpha;
        color: $type-text;
    }

    &.badge-float {
        background: $type-number-alpha;
        color: $type-number;
    }

    &.badge-currency-eur {
        background: $type-currency-alpha;
        color: $type-currency;
    }

    &.badge-currency-usd {
        background: $type-percent-alpha;
        color: $type-percent;
    }

    &.badge-text {
        background: $type-date-alpha;
        color: $type-date;
    }
}

.type-option-label {
    flex: 1;
    text-align: left;
}
</style>
