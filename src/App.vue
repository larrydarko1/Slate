<template>
  <div class="app-shell">
    <TitleBar />
    <Toolbar @addTable="ss.addTable()" />
    <FormulaBar />
    <CanvasWorkspace />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { useSpreadsheet, SPREADSHEET_KEY } from './composables/useSpreadsheet'
import TitleBar from './components/TitleBar.vue'
import Toolbar from './components/Toolbar.vue'
import FormulaBar from './components/FormulaBar.vue'
import CanvasWorkspace from './components/CanvasWorkspace.vue'

const ss = useSpreadsheet()
provide(SPREADSHEET_KEY, ss)
</script>

<style lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}
</style>
