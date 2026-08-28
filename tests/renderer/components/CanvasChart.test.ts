import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import CanvasChart from '@/renderer/components/CanvasChart.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

// jsdom has no canvas backend, and the chart is resolved through <component :is>
// so a stub name cannot intercept it — the wrappers are replaced at the module.
vi.mock('vue-chartjs', () => {
    const stub = { name: 'ChartStub', template: '<div class="chart-stub" />' };
    return { Bar: stub, Line: stub, Pie: stub, Doughnut: stub, Scatter: stub, Radar: stub };
});

describe('CanvasChart', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let tableId: string;

    /** The template opens with a comment, so the component has a fragment root. */
    const chartEl = () => wrapper.get('.canvas-chart');

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        tableId = ss.tables.value[0].id;
        ss.renameTable(tableId, 'Data');
        for (let r = 0; r < 3; r++) ss.setCellValue(tableId, 0, r, String(r + 1));
        ss.addChart();
        wrapper = mount(CanvasChart, {
            props: { chart: ss.charts.value[0] },
            global: {
                provide: { [SPREADSHEET_KEY as symbol]: ss },
            },
        });
    });

    afterEach(() => {
        wrapper.unmount();
        document.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('prompts for data while it has none', () => {
        expect(wrapper.find('.chart-empty').exists()).toBe(true);
    });

    it('renders a chart once a series is set', async () => {
        ss.setChartDataRef('series:0', 'Data::A1:A3');
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.chart-empty').exists()).toBe(false);
        expect(wrapper.find('.chart-body').exists()).toBe(true);
    });

    it('marks itself active when selected', async () => {
        expect(chartEl().classes()).toContain('active');
        ss.activeChartId.value = null;
        await wrapper.vm.$nextTick();
        expect(chartEl().classes()).not.toContain('active');
    });

    it('selects itself on mousedown', async () => {
        ss.activeChartId.value = null;
        await chartEl().trigger('mousedown');
        expect(ss.activeChartId.value).toBe(ss.charts.value[0].id);
    });

    it('shows the config panel only when active', async () => {
        expect(wrapper.find('.chart-config').exists()).toBe(true);
        ss.activeChartId.value = null;
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.chart-config').exists()).toBe(false);
    });

    it('edits the title in place', async () => {
        await wrapper.find('.chart-title-input').setValue('Revenue');
        expect(ss.charts.value[0].title).toBe('Revenue');
    });

    it('shows resize handles only when active', async () => {
        expect(wrapper.findAll('.resize-handle')).toHaveLength(8);
        ss.activeChartId.value = null;
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.resize-handle')).toHaveLength(0);
    });

    it('resizes from a handle, holding the minimum', async () => {
        const { width } = ss.charts.value[0];
        await wrapper.findAll('.resize-handle')[0].trigger('mousedown', { clientX: 0, clientY: 0 });
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 0 }));
        expect(ss.charts.value[0].width).toBe(width + 60);
    });

    it('drags to a new position', async () => {
        const { x } = ss.charts.value[0];
        await chartEl().trigger('mousedown', { clientX: 0, clientY: 0 });
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 15, clientY: 0 }));
        expect(ss.charts.value[0].x).toBe(x + 15);
    });

    it('deletes itself from its own button', async () => {
        await wrapper.find('.canvas-delete').trigger('click');
        expect(ss.charts.value).toHaveLength(0);
    });
});
