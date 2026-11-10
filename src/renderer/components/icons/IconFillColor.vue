<script setup lang="ts">
defineProps<{ swatch: string }>();
</script>

<template>
    <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none">
        <rect
            x="2.5"
            y="2.5"
            width="11"
            height="11"
            rx="2"
            stroke="currentColor"
            stroke-width="1.3" />
        <rect
            x="4"
            y="4"
            width="8"
            height="8"
            rx="1"
            :fill="swatch"
            opacity="0.5" />
    </svg>
</template>
