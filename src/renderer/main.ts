import { createApp } from 'vue';
import '@/renderer/styles/index.scss';
import App from '@/renderer/App.vue';
import { setDateLocale } from '@/renderer/composables/spreadsheet/engine/dates';

setDateLocale(window.electronAPI?.dateLocale ?? '');

createApp(App).mount('#app');
