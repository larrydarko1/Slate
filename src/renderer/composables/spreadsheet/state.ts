// state — shared reactive state for the spreadsheet composable.
// Owns: all reactive refs, computed props, color palettes, mutable counters.
// Does NOT own: business logic (sub-composables), formula engine (useFormulaEngine).

import { ref, computed } from 'vue'
import type { CellReference, SelectionRange, Canvas } from '../../types/spreadsheet'
import { createDefaultCanvas } from '../../types/spreadsheet'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormulaRef {
    tableId: string
    col: number
    row: number
    refString: string
    color: string
}

export interface Counters {
    maxZ: number
    tableCount: number
    canvasCount: number
}

// ─── Color palettes ──────────────────────────────────────────────────────────

export const REF_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export const CHART_REF_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

// ─── State factory ───────────────────────────────────────────────────────────

export function createState() {
    const canvases = ref<Canvas[]>([createDefaultCanvas('Canvas 1')])
    const activeCanvasId = ref<string>(canvases.value[0].id)

    const activeCanvas = computed(() =>
        canvases.value.find(c => c.id === activeCanvasId.value) ?? canvases.value[0]
    )
    const tables = computed(() => activeCanvas.value.tables)
    const textBoxes = computed(() => activeCanvas.value.textBoxes)
    const charts = computed(() => activeCanvas.value.charts)
    const canvasOffset = computed({
        get: () => activeCanvas.value.canvasOffset,
        set: (v) => { activeCanvas.value.canvasOffset = v },
    })
    const canvasZoom = computed({
        get: () => activeCanvas.value.canvasZoom,
        set: (v) => { activeCanvas.value.canvasZoom = v },
    })

    const activeCell = ref<CellReference | null>(null)
    const activeTextBoxId = ref<string | null>(null)
    const activeChartId = ref<string | null>(null)
    const selectionRange = ref<SelectionRange | null>(null)
    const isEditing = ref(false)
    const editValue = ref('')
    const formulaMode = ref(false)
    const formulaRefs = ref<FormulaRef[]>([])
    const canUndo = ref(false)
    const canRedo = ref(false)
    const chartSelectionMode = ref<string | null>(null)
    const chartSelectionActive = computed(() => chartSelectionMode.value !== null)
    const currentFilePath = ref<string | null>(null)
    const counters: Counters = { maxZ: 0, tableCount: 0, canvasCount: 1 }

    return {
        canvases, activeCanvasId, activeCanvas,
        tables, textBoxes, charts,
        canvasOffset, canvasZoom,
        activeCell, activeTextBoxId, activeChartId,
        selectionRange, isEditing, editValue,
        formulaMode, formulaRefs,
        canUndo, canRedo,
        chartSelectionMode, chartSelectionActive,
        currentFilePath,
        counters,
    }
}

export type SpreadsheetCoreState = ReturnType<typeof createState>
