<script setup lang="ts">
// App — root component, provides spreadsheet state to the entire app.
// Owns: dependency injection via provide(), global keyboard shortcuts, file-open listener.
// Does NOT own: spreadsheet logic (composables/), UI layout (child components).

import { provide, onMounted } from 'vue';
import { useSpreadsheet, SPREADSHEET_KEY } from './composables/useSpreadsheet';
import Toolbar from './components/Toolbar.vue';
import FormulaBar from './components/FormulaBar.vue';
import CanvasWorkspace from './components/CanvasWorkspace.vue';
import CanvasTabs from './components/CanvasTabs.vue';

const ss = useSpreadsheet();
provide(SPREADSHEET_KEY, ss);

// Handle new file with confirmation
const handleNewFile = () => {
    if (confirm('Create a new file? Any unsaved changes will be lost.')) {
        ss.newFile();
    }
};

// Handle keyboard shortcuts for file operations
const handleKeydown = (e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (!modifier) return;

    switch (e.key.toLowerCase()) {
        case 's':
            e.preventDefault();
            if (e.shiftKey) {
                ss.saveAsFile();
            } else {
                ss.saveFile();
            }
            break;
        case 'o':
            e.preventDefault();
            ss.openFile();
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

// Add one table on startup if none exist
onMounted(() => {
    if (ss.tables.value.length === 0) {
        ss.addTable();
    }

    // Listen for files opened via OS file association (double-click .slate)
    window.electronAPI?.onOpenFile((filePath: string) => {
        ss.loadFileFromPath(filePath);
    });
});
</script>

<template>
    <div class="app-shell" @keydown="handleKeydown">
        <Toolbar
            @add-table="ss.addTable()"
            @add-text-box="ss.addTextBox()"
            @add-chart="ss.addChart()"
            @new-file="handleNewFile"
            @open-file="ss.openFile"
            @save-file="ss.saveFile"
            @merge-cells="ss.mergeSelection"
            @unmerge-cells="ss.unmergeSelection"
        />
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
    background: var(--bg-primary);
    outline: none;
}
</style>
