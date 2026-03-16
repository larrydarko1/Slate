<script setup lang="ts">
// ColorPicker — reusable color picker dropdown with palette grid, clear, and custom input.
// Owns: dropdown toggle, color grid rendering, clear button, custom color input.
// Does NOT own: what happens when a color is applied (parent handles via events).

import { computed } from 'vue';

const props = defineProps<{
    label: string;
    clearLabel: string;
    currentColor: string | null | undefined;
    lastColor: string;
    palette: string[];
    disabled?: boolean;
    open: boolean;
    showCustomInput?: boolean;
}>();

const emit = defineEmits<{
    apply: [color: string];
    clear: [];
    'update:open': [value: boolean];
}>();

const showCustom = computed(() => props.showCustomInput !== false);

function isLightColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
}

function onQuickApply() {
    emit('apply', props.lastColor);
}

function toggleDropdown() {
    emit('update:open', !props.open);
}

function onCustomColor(e: Event) {
    emit('apply', (e.target as HTMLInputElement).value);
}
</script>

<template>
    <div class="color-btn-wrapper">
        <button class="tb color-btn" :disabled="disabled" :title="label" @click="onQuickApply">
            <slot name="icon" />
            <span class="color-indicator" :style="{ backgroundColor: lastColor }"></span>
        </button>
        <button class="tb color-chevron" :disabled="disabled" @click.stop="toggleDropdown">
            <svg width="8" height="8" viewBox="0 0 8 8">
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
        <div v-if="open" class="color-dropdown dropdown-anchor-right" @click.stop>
            <div class="color-dropdown-header">{{ label }}</div>
            <div class="color-grid">
                <button
                    v-for="c in palette"
                    :key="c"
                    class="color-swatch"
                    :class="{ active: c === currentColor, 'is-light': isLightColor(c) }"
                    :style="{ backgroundColor: c }"
                    :title="c"
                    @click="emit('apply', c)"
                ></button>
            </div>
            <button class="color-clear-btn" @click="emit('clear')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                </svg>
                <span>{{ clearLabel }}</span>
            </button>
            <div v-if="showCustom" class="color-custom-row">
                <label class="color-custom-label">Custom:</label>
                <input type="color" class="color-custom-input" :value="lastColor" @input="onCustomColor($event)" />
            </div>
            <!-- Extra controls slot (e.g. border width/radius) -->
            <slot name="extra" />
        </div>
    </div>
</template>

<style scoped lang="scss">
// Base toolbar button — self-contained so ColorPicker works outside Toolbar
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
}

.color-btn-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.color-btn {
    padding-right: 2px !important;
    border-top-right-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    position: relative;
}

.color-indicator {
    position: absolute;
    bottom: 3px;
    left: 6px;
    right: 6px;
    height: 2.5px;
    border-radius: 1px;
}

.color-chevron {
    padding: 0 3px !important;
    min-width: 14px !important;
    border-top-left-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
}

.color-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: var(--shadow-lg);
    padding: 10px;
    z-index: 200;
    width: 240px;

    &.dropdown-anchor-right {
        left: auto;
        right: 0;
    }
}

.color-dropdown-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
    letter-spacing: 0.02em;
}

.color-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 3px;
    margin-bottom: 8px;
}

.color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition:
        transform 0.1s,
        box-shadow 0.1s;
    padding: 0;

    &:hover {
        transform: scale(1.2);
        z-index: 1;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }

    &.active {
        outline: 2px solid var(--accent-color);
        outline-offset: 1px;
    }

    &.is-light {
        border-color: rgba(0, 0, 0, 0.15);
    }
}

.color-clear-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 6px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.1s;

    &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
}

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

.color-custom-input {
    width: 28px;
    height: 22px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1px;
    cursor: pointer;
    background: transparent;

    &::-webkit-color-swatch-wrapper {
        padding: 1px;
    }
    &::-webkit-color-swatch {
        border: none;
        border-radius: 2px;
    }
}
</style>
