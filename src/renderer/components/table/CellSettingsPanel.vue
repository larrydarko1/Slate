<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';

import { findLimitsProblem, type LimitsProblem } from '@/renderer/composables/spreadsheet/controls';
import { injectSpreadsheet } from '@/renderer/composables/useSpreadsheet';
import type { ControlLimits } from '@/renderer/types/spreadsheet';

type LimitsField = keyof ControlLimits;

const FIELDS: { field: LimitsField; label: string }[] = [
    { field: 'min', label: 'Minimum' },
    { field: 'max', label: 'Maximum' },
    { field: 'step', label: 'Step' },
];

const ss = injectSpreadsheet();

const uid = useId();

const limits = computed((): ControlLimits | null => ss.findActiveLimits());

// Text, not numbers, so a half-typed or cleared field stays as the user left it
const draft = ref<Record<LimitsField, string>>({ min: '', max: '', step: '' });
const problem = ref<LimitsProblem | null>(null);

function errorId(field: LimitsField): string | undefined {
    return problem.value?.field === field ? `${uid}-${field}-error` : undefined;
}

function onInput(field: LimitsField, e: Event): void {
    if (e.target instanceof HTMLInputElement) draft.value[field] = e.target.value;
}

/** Applies all three fields together, so the limits are never checked half-changed. */
function applyDraft(): void {
    const empty = FIELDS.find(({ field }): boolean => draft.value[field].trim() === '');
    if (empty !== undefined) {
        problem.value = { field: empty.field, message: 'Enter a number' };
        return;
    }
    const next: ControlLimits = {
        min: Number(draft.value.min),
        max: Number(draft.value.max),
        step: Number(draft.value.step),
    };
    problem.value = findLimitsProblem(next);
    if (problem.value === null) ss.setSelectionLimits(next);
}

function showLimits(current: ControlLimits | null): void {
    problem.value = null;
    if (current === null) return;
    draft.value = { min: String(current.min), max: String(current.max), step: String(current.step) };
}

// The active cell too: two steppers can share the same default limits object
watch([limits, ss.activeCell], ([current]) => showLimits(current), { immediate: true });
</script>

<template>
    <!-- mousedown stays here: the canvas would read it as a click on empty space and clear the selection -->
    <section
        v-if="limits !== null"
        class="cell-settings"
        :aria-labelledby="`${uid}-title`"
        @mousedown.stop>
        <h2
            :id="`${uid}-title`"
            class="cell-settings-title">
            Stepper
        </h2>
        <div
            v-for="{ field, label } in FIELDS"
            :key="field"
            class="cell-settings-field">
            <label :for="`${uid}-${field}`">{{ label }}</label>
            <input
                :id="`${uid}-${field}`"
                type="number"
                :value="draft[field]"
                :aria-invalid="problem?.field === field"
                :aria-describedby="errorId(field)"
                @input="onInput(field, $event)"
                @change="applyDraft" />
            <p
                v-if="problem?.field === field"
                :id="errorId(field)"
                class="cell-settings-error"
                role="alert">
                {{ problem.message }}
            </p>
        </div>
        <p class="cell-settings-hint">Applies to every stepper selected.</p>
    </section>
</template>

<style scoped lang="scss">
/* ––– Panel ––– */

.cell-settings {
    position: absolute;
    top: 0;
    left: calc(100% + #{$space-2});
    width: $size-28;
    padding: $space-2;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;
    background: $color-bg-surface;
    box-shadow: $shadow-md;
    font-size: $font-size-sm;
    cursor: default;
    z-index: $z-canvas-chrome;
}

.cell-settings-title {
    margin: 0 0 $space-2;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $color-text;
}

/* ––– Fields ––– */

.cell-settings-field {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: $space-0 $space-2;
    margin-bottom: $space-2;

    label {
        color: $color-text-muted;
        font-weight: $font-weight-semibold;
    }

    input {
        min-width: 0;
        padding: $space-0 $space-1;
        border: $border-width-thin $color-border;
        border-radius: $border-radius-sm;
        background: $color-bg-chrome;
        color: $color-text;
        font: inherit;
        font-variant-numeric: tabular-nums;

        &[aria-invalid='true'] {
            border-color: $color-danger;
        }
    }
}

.cell-settings-error {
    grid-column: 1 / -1;
    margin: 0;
    color: $color-danger;
    font-size: $font-size-sm;
}

.cell-settings-hint {
    margin: $space-2 0 0;
    color: $color-text-muted;
    font-size: $font-size-sm;
}
</style>
