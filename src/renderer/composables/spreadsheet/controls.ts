/**
 * createControls — cells that are clicked rather than typed into: checkboxes.
 * Owns: toggling, the keyboard shortcuts' selection-wide changes, and the rules
 *       for what a control holds when typed into or given its type.
 * Does NOT own: the cell's general value and type handling (cells.ts), drawing
 *               the control (CellDisplay.vue).
 */
import { detectType, isCheckedValue, type CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Cell, CellValue } from '@/renderer/types/spreadsheet';

type ControlType = Extract<CellDataType, 'checkbox'>;

/** A value a control can hold, wrapped so that an empty control (null) differs from "no fit". */
type ControlValue = { value: CellValue };

export type SpreadsheetControls = {
    toggleCheckbox: (tableId: string, col: number, row: number) => void;
    isActiveCellCheckbox: () => boolean;
    toggleSelectionCheckboxes: () => void;
};

type ControlsDeps = {
    findCell: (tableId: string, col: number, row: number) => Cell | null;
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    recalculate: () => void;
};

/** How each control reads a value it is given; a Record, so a new control cannot be left out. */
const CONVERTERS: Record<ControlType, (value: string | number | boolean) => ControlValue | null> = {
    checkbox: findCheckboxValue,
};

export function createControls(state: SpreadsheetCoreState, deps: ControlsDeps): SpreadsheetControls {
    function toggleCheckbox(tableId: string, col: number, row: number): void {
        const cell = deps.findCell(tableId, col, row);
        if (!isEditableControl(cell, 'checkbox')) return;
        deps.pushUndo();
        cell.value = !isCheckedValue(cell.value);
        deps.recalculate();
    }

    function isActiveCellCheckbox(): boolean {
        const active = state.activeCell.value;
        if (active === null) return false;
        return isEditableControl(deps.findCell(active.tableId, active.col, active.row), 'checkbox');
    }

    /**
     * Every checkbox in the selection takes the opposite of the active cell's
     * state, so a mixed selection ends up all ticked or all unticked rather
     * than each box flipping on its own.
     */
    function toggleSelectionCheckboxes(): void {
        const active = state.activeCell.value;
        const sr = deps.findNormalizedSelection();
        if (active === null || sr === null) return;
        const activeCell = deps.findCell(active.tableId, active.col, active.row);
        if (!isEditableControl(activeCell, 'checkbox')) return;

        const checked = !isCheckedValue(activeCell.value);
        deps.pushUndo();
        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                const cell = deps.findCell(sr.tableId, colIdx, rowIdx);
                if (isEditableControl(cell, 'checkbox')) cell.value = checked;
            }
        }
        deps.recalculate();
    }

    return { toggleCheckbox, isActiveCellCheckbox, toggleSelectionCheckboxes };
}

export function isControlType(type: CellDataType): type is ControlType {
    return type === 'checkbox';
}

/**
 * What a control holds after `raw` is typed into it, or null when `raw` is not
 * something the control can show and the cell becomes an ordinary one.
 * Clearing keeps the control, empty: the control goes only by changing the type.
 */
export function findTypedControlValue(type: ControlType, raw: string): ControlValue | null {
    if (raw === '') return { value: null };
    return findControlValue(type, raw);
}

/**
 * What a value becomes when its cell is made a control, or null when it has no
 * control to become and the cell is left as it is.
 */
export function findControlValue(type: ControlType, value: string | number | boolean): ControlValue | null {
    return CONVERTERS[type](value);
}

/** Ticked for TRUE or any non-zero number, unticked for FALSE or 0; other text has no box to become. */
function findCheckboxValue(value: string | number | boolean): ControlValue | null {
    if (typeof value === 'boolean') return { value };
    if (typeof value === 'number') return { value: value !== 0 };
    const detected = detectType(value);
    return detected.type === 'boolean' ? { value: detected.numericValue === 1 } : null;
}

/** A formula decides its own result, so a control showing one cannot be clicked. */
function isEditableControl(cell: Cell | null, type: ControlType): cell is Cell {
    return cell !== null && cell.cellType === type && cell.formula === undefined;
}
