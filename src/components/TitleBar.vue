<template>
  <div class="title-bar">
    <!-- macOS traffic-light spacer (left) -->
    <div class="traffic-light-spacer"></div>
    <div class="traffic-light-spacer"></div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped lang="scss">
.title-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  flex-shrink: 0;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
}

// Reserve space so traffic-light buttons don't overlap content
.traffic-light-spacer {
  width: 78px;
  flex-shrink: 0;
}

.title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}
</style>
