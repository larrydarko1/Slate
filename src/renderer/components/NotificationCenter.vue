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
    right: $space-12;
    bottom: $space-12;
    z-index: $z-tooltip-raised;
    pointer-events: none;
}

.notification-list {
    display: flex;
    flex-direction: column;
    gap: $space-5;
    margin: 0;
    padding: 0;
    list-style: none;
}

.notification {
    display: flex;
    align-items: flex-start;
    gap: $space-5;
    width: $size-33;
    padding: $space-5 $space-5 $space-5 $space-11;
    background: $bg-primary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-xl;
    box-shadow: $shadow-lg;
    color: $text-primary;
    font-size: $font-size-base;
    pointer-events: auto;
}

.notification-message {
    flex: 1;
    margin: 0;
    padding-top: $space-4;
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
    transform: translateY($space-5);
}
</style>
