<template>
  <div class="app-shell" @keydown="handleKeydown">
    <TitleBar />
    <Toolbar 
      @addTable="ss.addTable()" 
      @addTextBox="ss.addTextBox()"
      @addChart="ss.addChart()"
      @newFile="handleNewFile"
      @openFile="ss.openFile"
      @saveFile="ss.saveFile"
      @mergeCells="ss.mergeSelection"
      @unmergeCells="ss.unmergeSelection"
    />
    <FormulaBar />
    <CanvasWorkspace />
    <CanvasTabs />
  </div>
</template>

<script setup lang="ts">
import { provide, onMounted } from 'vue'
import { useSpreadsheet, SPREADSHEET_KEY } from './composables/useSpreadsheet'
import TitleBar from './components/TitleBar.vue'
import Toolbar from './components/Toolbar.vue'
import FormulaBar from './components/FormulaBar.vue'
import CanvasWorkspace from './components/CanvasWorkspace.vue'
import CanvasTabs from './components/CanvasTabs.vue'

const ss = useSpreadsheet()
provide(SPREADSHEET_KEY, ss)

// Handle new file with confirmation
const handleNewFile = () => {
  if (confirm('Create a new file? Any unsaved changes will be lost.')) {
    ss.newFile()
  }
}

// Handle keyboard shortcuts for file operations
const handleKeydown = (e: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? e.metaKey : e.ctrlKey

  if (!modifier) return

  switch (e.key.toLowerCase()) {
    case 's':
      e.preventDefault()
      if (e.shiftKey) {
        ss.saveAsFile()
      } else {
        ss.saveFile()
      }
      break
    case 'o':
      e.preventDefault()
      ss.openFile()
      break
    case 'n':
      e.preventDefault()
      handleNewFile()
      break
    case '=':
    case '+':
      e.preventDefault()
      ss.zoomIn()
      break
    case '-':
      e.preventDefault()
      ss.zoomOut()
      break
    case '0':
      e.preventDefault()
      ss.resetZoom()
      break
  }
}

// Add one table on startup if none exist
onMounted(() => {
  if (ss.tables.value.length === 0) {
    ss.addTable()
  }
})
</script>

<style lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  outline: none;
}
</style>
