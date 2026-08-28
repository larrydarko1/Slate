<script setup lang="ts">
import type { ResizeDir } from '@/renderer/composables/useDragResize';

defineEmits<{ start: [dir: ResizeDir, event: MouseEvent] }>();

const DIRECTIONS: ResizeDir[] = ['e', 's', 'w', 'n', 'se', 'nw', 'ne', 'sw'];
</script>

<template>
    <!-- Presentational: a resize grip is a pointer gesture with no keyboard
         equivalent. Size is editable from the object's own controls. -->
    <div
        v-for="dir in DIRECTIONS"
        :key="dir"
        role="presentation"
        class="resize-handle"
        :class="`rh-${dir}`"
        @mousedown.stop.prevent="$emit('start', dir, $event)"></div>
</template>
