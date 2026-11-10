<script setup lang="ts">
import { ref, onMounted } from 'vue';

import IconChart from '@/renderer/components/icons/IconChart.vue';
import IconFileNew from '@/renderer/components/icons/IconFileNew.vue';
import IconFolderOpen from '@/renderer/components/icons/IconFolderOpen.vue';
import IconMoon from '@/renderer/components/icons/IconMoon.vue';
import IconSave from '@/renderer/components/icons/IconSave.vue';
import IconSlateLogo from '@/renderer/components/icons/IconSlateLogo.vue';
import IconSun from '@/renderer/components/icons/IconSun.vue';
import IconTable from '@/renderer/components/icons/IconTable.vue';
import IconTextBox from '@/renderer/components/icons/IconTextBox.vue';

defineEmits<{
    addTable: [];
    addTextBox: [];
    addChart: [];
    newFile: [];
    openFile: [];
    saveFile: [];
}>();

const isDark = ref(false);

function toggleTheme(): void {
    isDark.value = !isDark.value;
    applyTheme();
    localStorage.setItem('slate-theme', isDark.value ? 'dark' : 'light');
}

function applyTheme(): void {
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

onMounted((): void => {
    const saved = localStorage.getItem('slate-theme');
    if (saved !== null) {
        isDark.value = saved === 'dark';
    } else {
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme();
});
</script>

<template>
    <div class="toolbar">
        <div class="toolbar-logo">
            <IconSlateLogo />
        </div>
        <div
            class="toolbar-sep"
            aria-hidden="true"></div>
        <div class="toolbar-group">
            <button
                class="tb"
                title="New (⌘N)"
                aria-label="New"
                @click="$emit('newFile')">
                <IconFileNew
                    width="16"
                    height="16" />
            </button>
            <button
                class="tb"
                title="Open (⌘O)"
                aria-label="Open"
                @click="$emit('openFile')">
                <IconFolderOpen
                    width="16"
                    height="16" />
            </button>
            <button
                class="tb"
                title="Save (⌘S)"
                aria-label="Save"
                @click="$emit('saveFile')">
                <IconSave
                    width="16"
                    height="16" />
            </button>
        </div>

        <div
            class="toolbar-sep"
            aria-hidden="true"></div>

        <div class="toolbar-group">
            <button
                class="tb has-label"
                title="Add table"
                @click="$emit('addTable')">
                <IconTable
                    width="16"
                    height="16" />
                <span>Table</span>
            </button>
            <button
                class="tb has-label"
                title="Add text box"
                @click="$emit('addTextBox')">
                <IconTextBox
                    width="16"
                    height="16" />
                <span>Text</span>
            </button>
            <button
                class="tb has-label"
                title="Add chart"
                @click="$emit('addChart')">
                <IconChart
                    width="16"
                    height="16" />
                <span>Chart</span>
            </button>
        </div>

        <div class="toolbar-spacer"></div>
        <div class="toolbar-group">
            <button
                class="tb theme-toggle"
                :title="isDark ? 'Light mode' : 'Dark mode'"
                :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
                @click="toggleTheme">
                <!-- Sun icon (shown in dark mode) -->
                <IconSun
                    v-if="isDark"
                    width="16"
                    height="16" />
                <!-- Moon icon (shown in light mode) -->
                <IconMoon
                    v-else
                    width="16"
                    height="16" />
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.toolbar {
    display: flex;
    align-items: center;
    height: $size-21;
    padding: 0 $space-3;
    background: $color-bg-chrome;
    user-select: none;
    flex-shrink: 0;
    gap: $space-0;
}

.toolbar-spacer {
    flex: 1;
}

/* ––––– Logo ––––– */

.toolbar-logo {
    display: flex;
    align-items: center;
    padding: 0 $space-1;
    flex-shrink: 0;
    color: $color-text-muted;
    -webkit-app-region: no-drag;

    svg {
        height: $size-21;
        width: auto;
        display: block;
    }
}
</style>
