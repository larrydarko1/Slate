/**
 * state — shared reactive state for the spreadsheet composable.
 * Owns: all reactive refs, computed props, color palettes, mutable counters.
 * Does NOT own: business logic (sub-composables), formula engine (useFormulaEngine).
 */
import { ref, computed, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import type {
    Canvas,
    CellReference,
    ChartObject,
    SelectionRange,
    SpreadsheetTable,
    TextBox,
} from '@/renderer/types/spreadsheet';
import { createDefaultCanvas } from '@/renderer/types/spreadsheet';

/**
 * The state `createState` returns, named rather than inferred.
 * Every member here was previously written out in its fully expanded structural
 * form — three copies of the whole Canvas shape, inlined. That is what a hover
 * tooltip shows, not what the code means: it says nothing about which named type
 * a member holds, and a field added to `Canvas` had to be pasted into each copy
 * by hand or the assignment stopped compiling.
 */
export type SpreadsheetCoreState = {
    canvases: Ref<Canvas[]>;
    activeCanvasId: Ref<string>;
    activeCanvas: ComputedRef<Canvas>;
    tables: ComputedRef<SpreadsheetTable[]>;
    textBoxes: ComputedRef<TextBox[]>;
    charts: ComputedRef<ChartObject[]>;
    canvasOffset: WritableComputedRef<{ x: number; y: number }>;
    canvasZoom: WritableComputedRef<number>;
    activeCell: Ref<CellReference | null>;
    activeTextBoxId: Ref<string | null>;
    activeChartId: Ref<string | null>;
    selectionRange: Ref<SelectionRange | null>;
    isEditing: Ref<boolean>;
    editValue: Ref<string>;
    formulaMode: Ref<boolean>;
    formulaRefs: Ref<FormulaRef[]>;
    canUndo: Ref<boolean>;
    canRedo: Ref<boolean>;
    isDirty: Ref<boolean>;
    chartSelectionMode: Ref<string | null>;
    chartSelectionActive: ComputedRef<boolean>;
    currentFilePath: Ref<string | null>;
    counters: Counters;
};

type FormulaRef = {
    tableId: string;
    col: number;
    row: number;
    refString: string;
    color: string;
};

type Counters = {
    maxZ: number;
    tableCount: number;
    canvasCount: number;
};

export const REF_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const CHART_REF_COLORS = [
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
];

// ─── State factory ───────────────────────────────────────────────────────────

export function createState(): SpreadsheetCoreState {
    // Held as a local first so `activeCanvasId` can name it without reading
    // `canvases.value`, which would read the ref outside a reactive context.
    const firstCanvas = createDefaultCanvas('Canvas 1');
    const canvases = ref<Canvas[]>([firstCanvas]);
    const activeCanvasId = ref<string>(firstCanvas.id);

    const activeCanvas = computed(
        () => canvases.value.find((c): boolean => c.id === activeCanvasId.value) ?? canvases.value[0],
    );
    const tables = computed(() => activeCanvas.value.tables);
    const textBoxes = computed(() => activeCanvas.value.textBoxes);
    const charts = computed(() => activeCanvas.value.charts);
    const canvasOffset = computed({
        get: (): { x: number; y: number } => activeCanvas.value.canvasOffset,
        set: (v): void => {
            activeCanvas.value.canvasOffset = v;
        },
    });
    const canvasZoom = computed({
        get: (): number => activeCanvas.value.canvasZoom,
        set: (v): void => {
            activeCanvas.value.canvasZoom = v;
        },
    });

    const activeCell = ref<CellReference | null>(null);
    const activeTextBoxId = ref<string | null>(null);
    const activeChartId = ref<string | null>(null);
    const selectionRange = ref<SelectionRange | null>(null);
    const isEditing = ref(false);
    const editValue = ref('');
    const formulaMode = ref(false);
    const formulaRefs = ref<FormulaRef[]>([]);
    const canUndo = ref(false);
    const canRedo = ref(false);
    const isDirty = ref(false);
    const chartSelectionMode = ref<string | null>(null);
    const chartSelectionActive = computed((): boolean => chartSelectionMode.value !== null);
    const currentFilePath = ref<string | null>(null);
    const counters: Counters = { maxZ: 0, tableCount: 0, canvasCount: 1 };

    return {
        canvases,
        activeCanvasId,
        activeCanvas,
        tables,
        textBoxes,
        charts,
        canvasOffset,
        canvasZoom,
        activeCell,
        activeTextBoxId,
        activeChartId,
        selectionRange,
        isEditing,
        editValue,
        formulaMode,
        formulaRefs,
        canUndo,
        canRedo,
        isDirty,
        chartSelectionMode,
        chartSelectionActive,
        currentFilePath,
        counters,
    };
}
