/**
 * useSpreadsheet — orchestrator composable that wires all sub-composables together.
 * Owns: composable instantiation order, dependency wiring, unified public API.
 * Does NOT own: any business logic (delegated to sub-composables in ./spreadsheet/).
 */

import { inject, type InjectionKey } from 'vue';
import { createState, type SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import { createHelpers, type SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import { createFormulaEngine, type SpreadsheetFormulaEngine } from '@/renderer/composables/spreadsheet/formulaEngine';
import { createUndoRedo, type SpreadsheetUndoRedo } from '@/renderer/composables/spreadsheet/undoRedo';
import { createCells, type SpreadsheetCells } from '@/renderer/composables/spreadsheet/cells';
import { createEditing, type SpreadsheetEditing } from '@/renderer/composables/spreadsheet/editing';
import { createSelection, type SpreadsheetSelection } from '@/renderer/composables/spreadsheet/selection';
import { createCanvases, type SpreadsheetCanvases } from '@/renderer/composables/spreadsheet/canvases';
import { createTables, type SpreadsheetTables } from '@/renderer/composables/spreadsheet/tables';
import { createMerge, type SpreadsheetMerge } from '@/renderer/composables/spreadsheet/merge';
import { createClipboard, type SpreadsheetClipboard } from '@/renderer/composables/spreadsheet/clipboard';
import { createFormulas, type SpreadsheetFormulas } from '@/renderer/composables/spreadsheet/formulas';
import { createCharts, type SpreadsheetCharts } from '@/renderer/composables/spreadsheet/charts';
import { createTextBoxes, type SpreadsheetTextBoxes } from '@/renderer/composables/spreadsheet/textBoxes';
import { createFileOps, type SpreadsheetFileOps } from '@/renderer/composables/spreadsheet/fileOps';

/**
 * The whole spreadsheet API, as one injectable value. Written as an
 * intersection of the sub-composable types rather than inferred, so it mirrors
 * the spreads in `useSpreadsheet`'s return statement line for line: adding a
 * member to a sub-composable publishes it here, and the `Pick`s below are the
 * exact list of helpers and engine calls components are allowed to reach.
 */
export type SpreadsheetState = Omit<SpreadsheetCoreState, 'counters'> &
    SpreadsheetCanvases &
    SpreadsheetTables &
    SpreadsheetCells &
    SpreadsheetSelection &
    SpreadsheetEditing &
    SpreadsheetMerge &
    SpreadsheetClipboard &
    SpreadsheetFormulas &
    SpreadsheetCharts &
    SpreadsheetTextBoxes &
    SpreadsheetFileOps &
    SpreadsheetUndoRedo &
    Pick<
        SpreadsheetHelpers,
        | 'findNormalizedSelection'
        | 'isInSelection'
        | 'isRowInSelection'
        | 'isColInSelection'
        | 'isEntireTableSelected'
        | 'hasMultiCellSelection'
        | 'findTable'
        | 'findTableGlobal'
        | 'findTextBox'
        | 'findChart'
        | 'bringToFront'
        | 'bringToFrontById'
    > &
    Pick<SpreadsheetFormulaEngine, 'recalculate' | 'shiftFormulaReferences'>;
export const SPREADSHEET_KEY = Symbol('spreadsheet') as InjectionKey<SpreadsheetState>;

export function useSpreadsheet(): SpreadsheetState {
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
        findNormalizedSelection: helpers.findNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
        recalculate: formulaEngine.recalculate,
    });
    const editing = createEditing(state, {
        findTableGlobal: helpers.findTableGlobal,
        recalculateMaxZ: helpers.recalculateMaxZ,
        findNormalizedSelection: helpers.findNormalizedSelection,
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
        findNormalizedSelection: helpers.findNormalizedSelection,
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
        findNormalizedSelection: helpers.findNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
    });
    const clipboard = createClipboard(state, {
        findTable: helpers.findTable,
        findNormalizedSelection: helpers.findNormalizedSelection,
        pushUndo: undoRedo.pushUndo,
        findCell: cells.findCell,
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
        findCell: cells.findCell,
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
        findNormalizedSelection: helpers.findNormalizedSelection,
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

/**
 * Reads the spreadsheet App.vue provides. Throws rather than returning
 * `undefined`, because every component that calls this renders inside App and a
 * missing provider is a wiring bug, not a state a caller can handle.
 */
export function injectSpreadsheet(): SpreadsheetState {
    const ss = inject(SPREADSHEET_KEY);
    if (ss === undefined)
        throw new Error('useSpreadsheet: no spreadsheet provided — is this component mounted inside App.vue?');
    return ss;
}
