import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import ChartConfigPanel from '@/renderer/components/chart/ChartConfigPanel.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('ChartConfigPanel', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;
    let chartId: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        ss.renameTable(ss.tables.value[0].id, 'Data');
        ss.addChart();
        chartId = ss.charts.value[0].id;
        wrapper = mount(ChartConfigPanel, {
            props: { chart: ss.charts.value[0] },
            global: { provide: { [SPREADSHEET_KEY as symbol]: ss } },
        });
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it('changes the chart type', async () => {
        await wrapper.find('select').setValue('line');
        expect(ss.charts.value[0].chartType).toBe('line');
    });

    it('labels every control', () => {
        for (const label of wrapper.findAll('label')) {
            const target = label.attributes('for');
            expect(target).toBeTruthy();
            expect(wrapper.find(`#${target}`).exists()).toBe(true);
        }
    });

    // Mounted as siblings in one tree: useId() counts per app, so two separate
    // mount() calls would both report `v-0` and prove nothing.
    it('gives each panel instance its own ids', () => {
        const Host = defineComponent({
            setup: () => () =>
                h('div', [
                    h(ChartConfigPanel, { chart: ss.charts.value[0] }),
                    h(ChartConfigPanel, { chart: ss.charts.value[0] }),
                ]),
        });
        const both = mount(Host, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
        const labels = both.findAll('label');
        expect(labels[0].attributes('for')).toBeTruthy();
        expect(labels[0].attributes('for')).not.toBe(labels[3].attributes('for'));
        both.unmount();
    });

    it('arms the picker when a reference field is clicked', async () => {
        await wrapper.findAll('.ref-field')[0].trigger('click');
        expect(ss.chartSelectionMode.value).toBe('labels');
    });

    it('arms the picker when a reference field is focused', async () => {
        await wrapper.findAll('.ref-input')[0].trigger('focus');
        expect(ss.chartSelectionMode.value).toBe('labels');
    });

    it('accepts a reference typed straight in', async () => {
        await wrapper.findAll('.ref-input')[0].setValue('Data::A1:A3');
        expect(ss.charts.value[0].dataSource?.labelRef?.refString).toBe('Data::A1:A3');
    });

    it('prompts for a series while there are none', () => {
        expect(wrapper.find('.ref-empty-hint').exists()).toBe(true);
    });

    it('adds and removes a series', async () => {
        await wrapper.find('.add-series-btn').trigger('click');
        expect(ss.charts.value[0].dataSource?.seriesRefs).toHaveLength(1);
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.ref-empty-hint').exists()).toBe(false);

        await wrapper.findAll('.ref-clear').at(-1)?.trigger('click');
        expect(ss.charts.value[0].dataSource?.seriesRefs).toHaveLength(0);
    });

    it('clears the label reference', async () => {
        ss.setChartDataRef('labels', 'Data::A1');
        await wrapper.vm.$nextTick();
        await wrapper.find('.ref-clear').trigger('click');
        expect(ss.charts.value[0].dataSource?.labelRef).toBeNull();
    });

    it('disarms the picker when the armed field is cleared', async () => {
        ss.setChartDataRef('labels', 'Data::A1');
        ss.startChartDataSelection('labels');
        await wrapper.vm.$nextTick();
        await wrapper.find('.ref-clear').trigger('click');
        expect(ss.chartSelectionMode.value).toBeNull();
    });

    it('outlines the field being picked into', async () => {
        ss.startChartDataSelection('labels');
        await wrapper.vm.$nextTick();
        const field = wrapper.findAll('.ref-field')[0];
        expect(field.classes()).toContain('picking');
        expect(field.attributes('style')).toContain('box-shadow');
    });

    it('toggles the header switch', async () => {
        ss.setChartDataRef('labels', 'Data::A1');
        await wrapper.vm.$nextTick();
        const header = wrapper.find('input[type="checkbox"]');
        await header.setValue(false);
        expect(ss.charts.value[0].dataSource?.useHeader).toBe(false);
    });

    it('turns the legend off and back on at a position', async () => {
        const legend = wrapper.findAll('select')[1];
        await legend.setValue('off');
        expect(ss.charts.value[0].showLegend).toBe(false);
        await legend.setValue('left');
        expect(ss.charts.value[0]).toMatchObject({ showLegend: true, legendPosition: 'left' });
    });

    it('toggles the grid', async () => {
        const grid = wrapper.findAll('input[type="checkbox"]').at(-1);
        await grid?.setValue(false);
        expect(ss.charts.value[0].showGrid).toBe(false);
    });

    it('leaves the header alone when the chart has no data source', async () => {
        ss.updateChart(chartId, { dataSource: null });
        await wrapper.vm.$nextTick();
        await wrapper.find('input[type="checkbox"]').setValue(false);
        expect(ss.charts.value[0].dataSource).toBeNull();
    });
});
