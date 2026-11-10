<script setup lang="ts">
import { computed, useId } from 'vue';

import IconChevronDown from '@/renderer/components/icons/IconChevronDown.vue';
import IconClose from '@/renderer/components/icons/IconClose.vue';

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
    'apply': [color: string];
    'clear': [];
    'update:open': [value: boolean];
}>();

defineSlots<{
    icon: () => unknown;
    extra?: () => unknown;
}>();

const uid = useId();

const showCustom = computed((): boolean => props.showCustomInput);

function isLightColor(hex: string): boolean {
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 > 200;
}

function onQuickApply(): void {
    emit('apply', props.lastColor);
}

function toggleDropdown(): void {
    emit('update:open', !props.open);
}

function onCustomColor(e: Event): void {
    if (e.target instanceof HTMLInputElement) emit('apply', e.target.value);
}
</script>

<template>
    <div class="color-btn-wrapper">
        <button
            class="tb color-btn"
            :disabled="disabled"
            :title="label"
            @click="onQuickApply">
            <slot name="icon" />
            <span
                class="color-indicator"
                :style="{ backgroundColor: lastColor }"></span>
        </button>
        <button
            class="tb color-chevron"
            :disabled="disabled"
            @click.stop="toggleDropdown">
            <IconChevronDown
                width="8"
                height="8" />
        </button>
        <div
            v-if="open"
            class="color-dropdown dropdown-anchor-right"
            @click.stop>
            <div class="color-dropdown-header">{{ label }}</div>
            <div class="color-grid">
                <button
                    v-for="c in palette"
                    :key="c"
                    class="color-swatch"
                    :class="{ 'active': c === currentColor, 'is-light': isLightColor(c) }"
                    :style="{ backgroundColor: c }"
                    :title="c"
                    @click="emit('apply', c)"></button>
            </div>
            <button
                class="color-clear-btn"
                @click="emit('clear')">
                <IconClose
                    width="12"
                    height="12" />
                <span>{{ clearLabel }}</span>
            </button>
            <div
                v-if="showCustom"
                class="color-custom-row">
                <label
                    class="color-custom-label"
                    :for="`${uid}-custom`"
                    >Custom:</label
                >
                <input
                    :id="`${uid}-custom`"
                    type="color"
                    class="color-custom-input"
                    :value="lastColor"
                    @input="onCustomColor($event)" />
            </div>
            <!-- Extra controls slot (e.g. border width/radius) -->
            <slot name="extra" />
        </div>
    </div>
</template>

<style scoped lang="scss">
.color-btn-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.color-btn {
    padding-right: $space-0;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    position: relative;
}

.color-indicator {
    position: absolute;
    bottom: $size-2;
    left: $size-5;
    right: $size-5;
    height: $size-2;
    border-radius: $border-radius-sm;
}

.color-btn:disabled .color-indicator {
    opacity: $opacity-subtle;
}

.color-chevron {
    padding: 0 $space-1;
    min-width: $size-10;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.color-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: $space-1;
    background: $color-bg-elevated;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-popover;
    padding: $space-3;
    z-index: $z-popover;
    width: $size-31;

    &.dropdown-anchor-right {
        left: auto;
        right: 0;
    }
}

.color-dropdown-header {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $color-text-muted;
    margin-bottom: $space-2;
    letter-spacing: $letter-spacing-wide;
}

.color-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: $space-1;
    margin-bottom: $space-2;
}

.color-swatch {
    width: $size-13;
    height: $size-13;
    border-radius: $border-radius-sm;
    border: $border-width-thin $color-scrim-soft;
    cursor: pointer;
    padding: 0;

    &:hover {
        outline: $border-width-thin $color-text-muted;
        outline-offset: $size-0;
    }

    &.active {
        outline: $border-width-thick $color-accent;
        outline-offset: $size-0;
    }

    &.is-light {
        border-color: $color-scrim-strong;
    }
}

.color-clear-btn {
    display: flex;
    align-items: center;
    gap: $space-2;
    width: 100%;
    padding: $space-1 $space-2;
    border: none;
    border-radius: $border-radius-md;
    background: transparent;
    color: $color-text-muted;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: background $duration-quick;

    &:hover {
        background: $color-bg-hover;
        color: $color-text;
    }
}

.color-custom-input {
    width: $size-17;
    height: $size-14;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-sm;
    padding: $space-0;
    cursor: pointer;
    background: transparent;

    &::-webkit-color-swatch-wrapper {
        padding: $space-0;
    }

    &::-webkit-color-swatch {
        border: none;
        border-radius: $border-radius-sm;
    }
}
</style>
