<script setup lang="ts">
import IconExternalLink from '@/renderer/components/icons/IconExternalLink.vue';
import type { CellTextStyle } from '@/renderer/composables/table/useTableCellRendering';

defineProps<{
    text: string;
    isUrl: boolean;
    textClass: Record<string, boolean>;
    textStyle: CellTextStyle;
}>();

defineEmits<{
    openUrl: [url: string];
}>();
</script>

<template>
    <span
        class="cell-text"
        :class="textClass"
        :style="textStyle"
        :title="text">
        {{ text }}
    </span>
    <button
        v-if="isUrl && text !== ''"
        class="cell-link-btn"
        title="Open link in browser"
        @mousedown.stop
        @click.stop="$emit('openUrl', text)">
        <IconExternalLink
            width="10"
            height="10" />
    </button>
</template>

<style scoped lang="scss">
/* ––– Cell text ––– */

.cell-text {
    display: block;
    padding: 0 $space-5;
    line-height: 2.1667;
    font-size: $font-size-base;
    color: $text-primary;

    @include truncate;

    &.error-value {
        color: $danger-color;
        font-size: $font-size-sm;
    }

    &.bold {
        font-weight: $font-weight-bold;
    }

    &.italic {
        font-style: italic;
    }

    &.type-currency {
        font-feature-settings: 'tnum' 1;
        letter-spacing: $letter-spacing-tight;
    }

    &.type-integer,
    &.type-float,
    &.type-percent,
    &.type-date {
        font-feature-settings: 'tnum' 1;
    }

    &.type-url {
        color: $accent-color;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: default;
    }
}

/* ––– Link open button (URL cells) ––– */

.cell-link-btn {
    position: absolute;
    right: $size-2;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: $size-11;
    height: $size-11;
    padding: 0;
    border: none;
    border-radius: $border-radius-xs;
    background: transparent;
    color: $accent-color;
    cursor: pointer;
    opacity: $opacity-none;
    pointer-events: none;
    z-index: $z-raised-high;

    &:hover {
        background: $accent-color-alpha;
    }
}

.cell:hover .cell-link-btn,
.cell.selected .cell-link-btn {
    opacity: $opacity-full;
    pointer-events: auto;
}
</style>
