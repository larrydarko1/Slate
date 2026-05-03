// useSpreadsheet — orchestrator composable that wires all sub-composables together.
// Owns: composable instantiation order, dependency wiring, unified public API.
// Does NOT own: any business logic (delegated to sub-composables in ./spreadsheet/).

import { type InjectionKey } from 'vue';
import { createState } from './spreadsheet/state';
import { createHelpers } from './spreadsheet/helpers';
import { createFormulaEngine } from './spreadsheet/useFormulaEngine';
import { createUndoRedo } from './spreadsheet/useUndoRedo';
import { createCells } from './spreadsheet/useCells';
import { createEditing } from './spreadsheet/useEditing';
import { createSelection } from './spreadsheet/useSelection';
import { createCanvases } from './spreadsheet/useCanvases';
import { createTables } from './spreadsheet/useTables';
import { createMerge } from './spreadsheet/useMerge';
import { createClipboard } from './spreadsheet/useClipboard';
import { createFormulas } from './spreadsheet/useFormulas';
import { createCharts } from './spreadsheet/useCharts';
import { createTextBoxes } from './spreadsheet/useTextBoxes';
import { createFileOps } from './spreadsheet/useFileOps';

export function useSpreadsheet() {
    // ── Foundation layer ─────────────────────────────────────────────────────
    const state = createState();
    const helpers = createHelpers(state);
    const formulaEngine = createFormulaEngine(state, {
        findTableGlobal: helpers.findTableGlobal,
        findTableByName: helpers.findTableByName,
        replaceNameInRef: helpers.replaceNameInRef,
    });
    const undoRedo = createUndoRedo(state, { recalculate: formulaEngine.recalculate });

    // ── Core domain layer ────────────────────────────────────────────────────
    const cells = createCells(state, {
        findTable: helpers.findTable,
        getNormalizedSelection: helpers.getNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
        recalculate: formulaEngine.recalculate,
    });
    const editing = createEditing(state, {
        findTableGlobal: helpers.findTableGlobal,
        recalculateMaxZ: helpers.recalculateMaxZ,
        getNormalizedSelection: helpers.getNormalizedSelection,
        setCellValue: cells.setCellValue,
        getRawValue: cells.getRawValue,
        pushUndo: undoRedo.pushUndo,
    });
    const selection = createSelection(state, {
        findTable: helpers.findTable,
        bringToFront: helpers.bringToFront,
        commitEdit: editing.commitEdit,
    });

    // ── Feature layer ────────────────────────────────────────────────────────
    const canvases = createCanvases(state, {
        pushUndo: undoRedo.pushUndo,
        recalculateMaxZ: helpers.recalculateMaxZ,
        rewriteCanvasNameReferences: formulaEngine.rewriteCanvasNameReferences,
        recalculate: formulaEngine.recalculate,
        commitEdit: editing.commitEdit,
    });
    const tables = createTables(state, {
        findTable: helpers.findTable,
        getNormalizedSelection: helpers.getNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
        startUndoBatch: undoRedo.startUndoBatch,
        recalculate: formulaEngine.recalculate,
        remapAllFormulasInTable: formulaEngine.remapAllFormulasInTable,
        remapRowIdx: formulaEngine.remapRowIdx,
        remapColIdx: formulaEngine.remapColIdx,
        rewriteTableNameReferences: formulaEngine.rewriteTableNameReferences,
    });
    const merge = createMerge(state, {
        findTable: helpers.findTable,
        getNormalizedSelection: helpers.getNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
    });
    const clipboard = createClipboard(state, {
        findTable: helpers.findTable,
        getNormalizedSelection: helpers.getNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
        getCell: cells.getCell,
        setCellValue: cells.setCellValue,
        getDisplayValue: cells.getDisplayValue,
        getRawValue: cells.getRawValue,
        setCellFormat: cells.setCellFormat,
        shiftFormulaReferences: formulaEngine.shiftFormulaReferences,
        recalculate: formulaEngine.recalculate,
    });
    const formulas = createFormulas(state, {
        findTableGlobal: helpers.findTableGlobal,
        findTableByName: helpers.findTableByName,
        getCell: cells.getCell,
        startEditing: editing.startEditing,
    });
    const charts = createCharts(state, {
        findChart: helpers.findChart,
        findTableGlobal: helpers.findTableGlobal,
        findTableByName: helpers.findTableByName,
        bringToFrontById: helpers.bringToFrontById,
        pushUndo: undoRedo.pushUndo,
        startUndoBatch: undoRedo.startUndoBatch,
        commitEdit: editing.commitEdit,
    });
    const textBoxes = createTextBoxes(state, {
        findTextBox: helpers.findTextBox,
        bringToFrontById: helpers.bringToFrontById,
        pushUndo: undoRedo.pushUndo,
        startUndoBatch: undoRedo.startUndoBatch,
        commitEdit: editing.commitEdit,
        stopChartDataSelection: charts.stopChartDataSelection,
    });
    const fileOps = createFileOps(state, {
        recalculate: formulaEngine.recalculate,
        recalculateMaxZ: helpers.recalculateMaxZ,
    });

    // ── Unified public API ───────────────────────────────────────────────────
    return {
        // State
        canvases: state.canvases,
        activeCanvasId: state.activeCanvasId,
        activeCanvas: state.activeCanvas,
        tables: state.tables,
        textBoxes: state.textBoxes,
        charts: state.charts,
        activeCell: state.activeCell,
        activeTextBoxId: state.activeTextBoxId,
        activeChartId: state.activeChartId,
        selectionRange: state.selectionRange,
        isEditing: state.isEditing,
        editValue: state.editValue,
        formulaMode: state.formulaMode,
        canvasOffset: state.canvasOffset,
        canvasZoom: state.canvasZoom,
        currentFilePath: state.currentFilePath,
        formulaRefs: state.formulaRefs,
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        isDirty: state.isDirty,
        chartSelectionMode: state.chartSelectionMode,
        chartSelectionActive: state.chartSelectionActive,

        // Canvases
        ...canvases,

        // Tables
        ...tables,

        // Cell access
        ...cells,

        // Selection
        ...selection,
        getNormalizedSelection: helpers.getNormalizedSelection,
        isInSelection: helpers.isInSelection,
        isRowInSelection: helpers.isRowInSelection,
        isColInSelection: helpers.isColInSelection,
        isEntireTableSelected: helpers.isEntireTableSelected,
        hasMultiCellSelection: helpers.hasMultiCellSelection,

        // Editing
        ...editing,

        // Merge
        ...merge,

        // Clipboard
        ...clipboard,
        shiftFormulaReferences: formulaEngine.shiftFormulaReferences,

        // Formulas
        ...formulas,

        // Charts
        ...charts,

        // Text boxes
        ...textBoxes,

        // File operations
        ...fileOps,

        // Undo / Redo
        ...undoRedo,

        // Engine & helpers (used by components)
        recalculate: formulaEngine.recalculate,
        findTable: helpers.findTable,
        findTableGlobal: helpers.findTableGlobal,
        findTextBox: helpers.findTextBox,
        findChart: helpers.findChart,
        bringToFront: helpers.bringToFront,
        bringToFrontById: helpers.bringToFrontById,
    };
}

export type SpreadsheetState = ReturnType<typeof useSpreadsheet>;
export const SPREADSHEET_KEY = Symbol('spreadsheet') as InjectionKey<SpreadsheetState>;
