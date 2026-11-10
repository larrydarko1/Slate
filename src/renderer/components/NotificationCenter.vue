<script setup lang="ts">
import IconClose from '@/renderer/components/icons/IconClose.vue';
import { useNotifications } from '@/renderer/composables/useNotifications';

const { notifications, dismiss, pause, resume } = useNotifications();
</script>

<template>
    <section
        class="notification-center"
        aria-label="Notifications">
        <TransitionGroup
            name="notification"
            tag="ul"
            class="notification-list">
            <!-- eslint-disable-next-line a11y/no-static-element-interactions -- hover and focus only hold the dismiss timer; nothing is activated -->
            <li
                v-for="notification in notifications"
                :key="notification.id"
                class="notification"
                role="alert"
                @mouseenter="pause"
                @mouseleave="resume"
                @focusin="pause"
                @focusout="resume">
                <p class="notification-message">{{ notification.message }}</p>
                <button
                    class="tb"
                    title="Dismiss"
                    aria-label="Dismiss"
                    @click="dismiss(notification.id)">
                    <IconClose
                        width="12"
                        height="12" />
                </button>
            </li>
        </TransitionGroup>
    </section>
</template>

<style scoped lang="scss">
.notification-center {
    position: fixed;
    right: $space-4;
    bottom: $space-4;
    z-index: $z-tooltip-raised;
    pointer-events: none;
}

.notification-list {
    display: flex;
    flex-direction: column;
    gap: $space-2;
    margin: 0;
    padding: 0;
    list-style: none;
}

.notification {
    display: flex;
    align-items: flex-start;
    gap: $space-2;
    width: $size-33;
    padding: $space-2 $space-2 $space-2 $space-3;
    background: $color-bg-elevated;
    border: $border-width-thin $color-border;
    border-radius: $border-radius-lg;
    box-shadow: $shadow-popover;
    color: $color-text;
    font-size: $font-size-base;
    pointer-events: auto;
}

.notification-message {
    flex: 1;
    margin: 0;
    padding-top: $space-1;
    line-height: $line-height-base;
    overflow-wrap: anywhere;
}

.notification-enter-active,
.notification-leave-active {
    transition:
        opacity $transition-base,
        transform $transition-base;
}

.notification-enter-from,
.notification-leave-to {
    opacity: 0;
    transform: translateY($space-2);
}
</style>
