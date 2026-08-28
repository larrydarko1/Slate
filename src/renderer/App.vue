<script setup lang="ts">
import { provide, onMounted, onBeforeUnmount } from 'vue';
import { useSpreadsheet, SPREADSHEET_KEY } from '@/renderer/composables/useSpreadsheet';
import Toolbar from '@/renderer/components/Toolbar.vue';
import FormulaBar from '@/renderer/components/FormulaBar.vue';
import CanvasWorkspace from '@/renderer/components/CanvasWorkspace.vue';
import CanvasTabs from '@/renderer/components/CanvasTabs.vue';

const ss = useSpreadsheet();

// Handle new file with confirmation
const handleNewFile = (): void => {
    if (confirm('Create a new file? Any unsaved changes will be lost.')) {
        ss.newFile();
    }
};

/**
 * File and zoom shortcuts. Bound to `window` rather than to the shell element:
 * these are application-wide accelerators, and a listener on a `<div>` only
 * fires while focus happens to be inside it.
 */
const handleKeydown = (e: KeyboardEvent): void => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (!modifier) return;

    switch (e.key.toLowerCase()) {
        case 's':
            e.preventDefault();
            if (e.shiftKey) {
                void ss.saveAsFile();
            } else {
                void ss.saveFile();
            }
            break;
        case 'o':
            e.preventDefault();
            void ss.openFile();
            break;
        case 'n':
            e.preventDefault();
            handleNewFile();
            break;
        case '=':
        case '+':
            e.preventDefault();
            ss.zoomIn();
            break;
        case '-':
            e.preventDefault();
            ss.zoomOut();
            break;
        case '0':
            e.preventDefault();
            ss.resetZoom();
            break;
        case 'z':
            e.preventDefault();
            if (e.shiftKey) {
                ss.redo();
            } else {
                ss.undo();
            }
            break;
    }
};

provide(SPREADSHEET_KEY, ss);

onMounted((): void => {
    // A blank canvas with nothing on it gives the user nowhere to start.
    if (ss.tables.value.length === 0) {
        ss.addTable();
    }

    // Listen for files opened via OS file association (double-click .slate)
    window.electronAPI?.onOpenFile((filePath: string): void => {
        void ss.loadFileFromPath(filePath);
    });

    window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount((): void => {
    window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
    <div class="app-shell">
        <Toolbar
            @add-table="ss.addTable()"
            @add-text-box="ss.addTextBox()"
            @add-chart="ss.addChart()"
            @new-file="handleNewFile"
            @open-file="ss.openFile"
            @save-file="ss.saveFile"
            @merge-cells="ss.mergeSelection"
            @unmerge-cells="ss.unmergeSelection" />
        <FormulaBar />
        <CanvasWorkspace />
        <CanvasTabs />
    </div>
</template>

<style lang="scss">
.app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: $bg-primary;
    outline: none;
}
</style>
