<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { SPREADSHEET_KEY } from '../../composables/useSpreadsheet';
import type { CellDataType } from '../../composables/spreadsheet/engine/cellTypes';
import { getTypeLabel } from '../../composables/spreadsheet/engine/cellTypes';

const ss = inject(SPREADSHEET_KEY)!;

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

function changeDecimals(delta: number): void {
    if (!ss.activeCell.value) return;
    const fmt = ss.getActiveCellFormat();
    const current = fmt?.decimalPlaces ?? 2;
    const next = Math.max(0, Math.min(10, current + delta));
    ss.setSelectionFormat({ decimalPlaces: next });
}

function toggleTypeMenu(): void {
    typeMenuOpen.value = !typeMenuOpen.value;
}

function setType(t: CellDataType): void {
    if (!ss.activeCell.value) return;
    ss.setCellType(ss.activeCell.value.tableId, ss.activeCell.value.col, ss.activeCell.value.row, t);
    typeMenuOpen.value = false;
}

function onClickOutside(e: MouseEvent): void {
    if (typeMenuOpen.value && typeSelectorRef.value && !typeSelectorRef.value.contains(e.target as Node)) {
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
    background: $bg-primary;
    border: 1px solid $border-color;
    border-radius: 8px;
    box-shadow: $shadow-lg;
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
    color: $text-primary;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;

    &:hover {
        background: $bg-hover;
    }

    &.active {
        background: $accent-color-alpha;
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
    background: $bg-tertiary;
    color: $text-muted;

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
</style>
