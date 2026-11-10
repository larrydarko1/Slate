<script setup lang="ts">
import IconCheck from '@/renderer/components/icons/IconCheck.vue';
import IconChevronDown from '@/renderer/components/icons/IconChevronDown.vue';
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
    step: [direction: -1 | 1];
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
    <!-- Stepper cell, while selected; mousedown prevented as on the checkbox -->
    <span
        v-else-if="control?.type === 'stepper'"
        class="cell-text cell-stepper"
        :style="textStyle">
        <span
            class="cell-stepper-value"
            :class="textClass"
            :title="text">
            {{ text }}
        </span>
        <button
            type="button"
            class="cell-stepper-btn"
            tabindex="-1"
            aria-label="Step down"
            title="Step down (Alt+↓)"
            :disabled="!control.canStepDown"
            @mousedown.prevent
            @click.stop="$emit('step', -1)"
            @dblclick.stop>
            <IconChevronDown />
        </button>
        <button
            type="button"
            class="cell-stepper-btn step-up"
            tabindex="-1"
            aria-label="Step up"
            title="Step up (Alt+↑)"
            :disabled="!control.canStepUp"
            @mousedown.prevent
            @click.stop="$emit('step', 1)"
            @dblclick.stop>
            <IconChevronDown />
        </button>
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
    padding: 0 $space-2;
    line-height: $size-16;
    font-size: $font-size-base;
    color: $color-text;

    @include truncate;

    &.error-value {
        color: $color-danger;
        font-size: $font-size-sm;
    }

    &.bold {
        font-weight: $font-weight-semibold;
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
    &.type-date,
    &.type-stepper {
        font-feature-settings: 'tnum' 1;
    }

    &.type-url {
        color: $color-accent;
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
    border: $border-width-thin $color-text-muted;
    border-radius: $border-radius-sm;
    color: $color-accent;
    transition:
        background $transition-quick,
        border-color $transition-quick;

    &.checked {
        border-color: $color-accent;
        background: $color-accent-subtle;
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
    color: $color-text-muted;
    cursor: pointer;
    transition: color $transition-quick;

    svg {
        width: $size-9;
        height: $size-9;
        transition: fill $transition-quick;
    }

    &.filled {
        color: $color-accent;

        svg {
            fill: currentcolor;
        }
    }
}

.cell-rating[role='img'] .cell-rating-star {
    cursor: default;
}

.cell-rating[role='radiogroup']:has(.cell-rating-star:hover) .cell-rating-star {
    color: $color-accent;

    svg {
        fill: currentcolor;
    }
}

.cell-rating[role='radiogroup'] .cell-rating-star:hover ~ .cell-rating-star {
    color: $color-text-muted;

    svg {
        fill: none;
    }
}

/* ––– Stepper ––– */

.cell-stepper {
    display: flex;
    align-items: center;
    padding-right: 0;
}

.cell-stepper-value {
    flex: 1;
    min-width: 0;

    @include truncate;
}

.cell-stepper-btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: $size-12;
    height: $size-15;
    padding: 0;
    border: none;
    border-radius: $border-radius-sm;
    background: transparent;
    color: $color-text-muted;
    cursor: pointer;
    transition:
        background $transition-quick,
        color $transition-quick;

    &:hover:not(:disabled) {
        background: $color-accent-subtle;
        color: $color-accent;
    }

    &:disabled {
        opacity: $opacity-subtle;
        cursor: default;
    }

    &.step-up svg {
        transform: rotate(180deg);
    }

    svg {
        width: $size-9;
        height: $size-9;
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
    border-radius: $border-radius-sm;
    background: transparent;
    color: $color-accent;
    cursor: pointer;
    opacity: $opacity-none;
    pointer-events: none;
    z-index: $z-raised-high;

    &:hover {
        background: $color-accent-subtle;
    }
}

.cell:hover .cell-link-btn,
.cell.selected .cell-link-btn {
    opacity: $opacity-full;
    pointer-events: auto;
}
</style>
