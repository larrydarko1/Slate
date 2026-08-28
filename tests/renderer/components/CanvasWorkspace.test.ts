import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import CanvasWorkspace from '@/renderer/components/CanvasWorkspace.vue';
import { useSpreadsheet, SPREADSHEET_KEY, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

vi.mock('vue-chartjs', () => {
    const stub = { name: 'ChartStub', template: '<div class="chart-stub" />' };
    return { Bar: stub, Line: stub, Pie: stub, Doughnut: stub, Scatter: stub, Radar: stub };
});

describe('CanvasWorkspace', () => {
    let ss: SpreadsheetState;
    let wrapper: VueWrapper;

    const surface = () => wrapper.get('.canvas-workspace');

    beforeEach(() => {
        ss = useSpreadsheet();
        wrapper = mount(CanvasWorkspace, { global: { provide: { [SPREADSHEET_KEY as symbol]: ss } } });
    });

    afterEach(() => {
        wrapper.unmount();
        document.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('invites the user to start when the canvas is empty', () => {
        expect(wrapper.find('.canvas-empty').exists()).toBe(true);
    });

    it('hides the empty state once something is on the canvas', async () => {
        ss.addTable();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.canvas-empty').exists()).toBe(false);
    });

    it('renders one of each object type', async () => {
        ss.addTable();
        ss.addTextBox();
        ss.addChart();
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll('.spreadsheet-table')).toHaveLength(1);
        expect(wrapper.findAll('.canvas-textbox')).toHaveLength(1);
        expect(wrapper.findAll('.canvas-chart')).toHaveLength(1);
    });

    it('removes a table when it asks to go', async () => {
        ss.addTable();
        await wrapper.vm.$nextTick();
        await wrapper.get('.table-close-btn').trigger('click');
        expect(ss.tables.value).toHaveLength(0);
    });

    it('applies the pan offset and zoom as one transform', async () => {
        ss.canvasOffset.value = { x: 10, y: 20 };
        ss.setZoom(2);
        await wrapper.vm.$nextTick();
        const style = wrapper.get('.canvas-content').attributes('style') ?? '';
        expect(style).toContain('translate(10px, 20px)');
        expect(style).toContain('scale(2)');
    });

    it('scales the grid background with the zoom', async () => {
        ss.setZoom(2);
        await wrapper.vm.$nextTick();
        const style = wrapper.get('.canvas-bg').attributes('style') ?? '';
        expect(style).toContain('48px 48px');
    });

    describe('panning', () => {
        it('moves the canvas with a drag on the background', async () => {
            await wrapper.get('.canvas-bg').trigger('mousedown', { button: 0, clientX: 0, clientY: 0 });
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 40 }));
            expect(ss.canvasOffset.value).toEqual({ x: 30, y: 40 });
        });

        it('stops panning on mouseup', async () => {
            await wrapper.get('.canvas-bg').trigger('mousedown', { button: 0, clientX: 0, clientY: 0 });
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
            document.dispatchEvent(new MouseEvent('mouseup'));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));
            expect(ss.canvasOffset.value).toEqual({ x: 10, y: 10 });
        });

        it('ignores a non-primary button', async () => {
            await wrapper.get('.canvas-bg').trigger('mousedown', { button: 2, clientX: 0, clientY: 0 });
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 40 }));
            expect(ss.canvasOffset.value).toEqual({ x: 0, y: 0 });
        });

        it('clears the selection when the background is clicked', async () => {
            ss.addTable();
            await wrapper.vm.$nextTick();
            ss.selectCell(ss.tables.value[0].id, 0, 0);
            await wrapper.get('.canvas-bg').trigger('mousedown', { button: 0, clientX: 0, clientY: 0 });
            expect(ss.activeCell.value).toBeNull();
        });
    });

    describe('the wheel', () => {
        it('pans by the scroll delta', async () => {
            await surface().trigger('wheel', { deltaX: 20, deltaY: 30 });
            expect(ss.canvasOffset.value).toEqual({ x: -20, y: -30 });
        });

        // trigger() cannot set ctrlKey (it is getter-only on the event), so the
        // pinch-zoom gesture is dispatched as a real WheelEvent.
        it('zooms with the modifier held', async () => {
            surface().element.dispatchEvent(
                new WheelEvent('wheel', {
                    deltaY: -100,
                    ctrlKey: true,
                    clientX: 0,
                    clientY: 0,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await wrapper.vm.$nextTick();
            expect(ss.canvasZoom.value).toBeGreaterThan(1);
        });
    });
});
