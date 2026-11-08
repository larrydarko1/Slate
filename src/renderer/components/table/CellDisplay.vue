<script setup lang="ts">
import IconCheck from '@/renderer/components/icons/IconCheck.vue';
import IconExternalLink from '@/renderer/components/icons/IconExternalLink.vue';
import IconStar from '@/renderer/components/icons/IconStar.vue';
import { MAX_RATING } from '@/renderer/composables/spreadsheet/controls';
import type { CellTextStyle, ControlState } from '@/renderer/composables/table/useTableCellRendering';

defineProps<{
    text: string;
    isUrl: boolean;
    textClass: Record<string, boolean>;
    textStyle: CellTextStyle;
    control: ControlState | null;
}>();

defineEmits<{
    openUrl: [url: string];
    toggle: [];
    rate: [stars: number];
}>();

function starLabel(stars: number): string {
    return stars === 1 ? '1 star' : `${stars} stars`;
}
</script>

<template>
    <!-- Checkbox cell -->
    <span
        v-if="control?.type === 'checkbox'"
        class="cell-text"
        :style="textStyle">
        <span
            v-if="control.readonly"
            class="cell-checkbox"
            role="img"
            :aria-label="control.checked ? 'Ticked' : 'Not ticked'"
            title="Set by its formula">
            <span
                class="cell-checkbox-box"
                :class="{ checked: control.checked }">
                <IconCheck v-if="control.checked" />
            </span>
        </span>
        <!-- mousedown still reaches the cell to select it; prevented so the
             button doesn't take focus, which would make Space toggle twice -->
        <button
            v-else
            type="button"
            role="checkbox"
            class="cell-checkbox"
            tabindex="-1"
            aria-label="Tick box"
            :aria-checked="control.checked"
            @mousedown.prevent
            @click.stop="$emit('toggle')"
            @dblclick.stop>
            <span
                class="cell-checkbox-box"
                :class="{ checked: control.checked }">
                <IconCheck v-if="control.checked" />
            </span>
        </button>
    </span>
    <!-- Star rating cell -->
    <span
        v-else-if="control?.type === 'rating'"
        class="cell-text"
        :style="textStyle">
        <span
            v-if="control.readonly"
            class="cell-rating"
            role="img"
            :aria-label="`${starLabel(control.stars)} of ${MAX_RATING}`"
            title="Set by its formula">
            <span
                v-for="stars in MAX_RATING"
                :key="stars"
                class="cell-rating-star"
                :class="{ filled: stars <= control.stars }">
                <IconStar />
            </span>
        </span>
        <span
            v-else
            class="cell-rating"
            role="radiogroup"
            aria-label="Star rating">
            <!-- mousedown prevented for the same reason as the checkbox's -->
            <button
                v-for="stars in MAX_RATING"
                :key="stars"
                type="button"
                role="radio"
                class="cell-rating-star"
                :class="{ filled: stars <= control.stars }"
                tabindex="-1"
                :aria-label="starLabel(stars)"
                :aria-checked="stars === control.stars"
                @mousedown.prevent
                @click.stop="$emit('rate', stars)"
                @dblclick.stop>
                <IconStar />
            </button>
        </span>
    </span>
    <span
        v-else
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

/* ––– Checkbox ––– */

.cell-checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: $size-15;
    height: $size-15;
    padding: 0;
    border: none;
    background: transparent;
    vertical-align: middle;
    cursor: pointer;

    &[role='img'] {
        cursor: default;
    }
}

.cell-checkbox-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: $size-10;
    height: $size-10;
    border: $border-width-thin $text-muted;
    border-radius: $border-radius-xs;
    color: $accent-color;
    transition:
        background $transition-quick,
        border-color $transition-quick;

    &.checked {
        border-color: $accent-color;
        background: $accent-color-alpha;
    }

    svg {
        width: $size-8;
        height: $size-8;
    }
}

.cell-checkbox[role='img'] .cell-checkbox-box {
    opacity: $opacity-high;
}

/* ––– Star rating ––– */

.cell-rating {
    display: inline-flex;
    vertical-align: middle;

    &[role='img'] {
        opacity: $opacity-high;
    }
}

.cell-rating-star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: $size-12;
    height: $size-15;
    padding: 0;
    border: none;
    background: transparent;
    color: $text-muted;
    cursor: pointer;
    transition: color $transition-quick;

    svg {
        width: $size-9;
        height: $size-9;
        transition: fill $transition-quick;
    }

    &.filled {
        color: $accent-color;

        svg {
            fill: currentcolor;
        }
    }
}

.cell-rating[role='img'] .cell-rating-star {
    cursor: default;
}

.cell-rating[role='radiogroup']:has(.cell-rating-star:hover) .cell-rating-star {
    color: $accent-color;

    svg {
        fill: currentcolor;
    }
}

.cell-rating[role='radiogroup'] .cell-rating-star:hover ~ .cell-rating-star {
    color: $text-muted;

    svg {
        fill: none;
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
