/**
 * createControls — cells that are clicked rather than typed into: checkboxes
 * and star ratings.
 * Owns: clicking a control, the keyboard shortcuts' selection-wide changes,
 *       and the rules for what a control holds when typed into or given its type.
 * Does NOT own: the cell's general value and type handling (cells.ts), drawing
 *               the control (CellDisplay.vue).
 */
import { detectType, isCheckedValue, type CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Cell, CellValue } from '@/renderer/types/spreadsheet';

type ControlType = Extract<CellDataType, 'checkbox' | 'rating'>;

/** A value a control can hold, wrapped so that an empty control (null) differs from "no fit". */
type ControlValue = { value: CellValue };

export type SpreadsheetControls = {
    toggleCheckbox: (tableId: string, col: number, row: number) => void;
    isActiveCellCheckbox: () => boolean;
    toggleSelectionCheckboxes: () => void;
    setRating: (tableId: string, col: number, row: number, stars: number) => void;
    handleControlKey: (key: string) => boolean;
};

type ControlsDeps = {
    findCell: (tableId: string, col: number, row: number) => Cell | null;
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    recalculate: () => void;
};

export const MAX_RATING = 5;

/** How each control reads a value it is given; a Record, so a new control cannot be left out. */
const CONVERTERS: Record<ControlType, (value: string | number | boolean) => ControlValue | null> = {
    checkbox: findCheckboxValue,
    rating: findRatingValue,
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
        return findActiveControl('checkbox') !== null;
    }

    /**
     * Every checkbox in the selection takes the opposite of the active cell's
     * state, so a mixed selection ends up all ticked or all unticked rather
     * than each box flipping on its own.
     */
    function toggleSelectionCheckboxes(): void {
        const activeCell = findActiveControl('checkbox');
        if (activeCell === null) return;
        setSelectionControls('checkbox', !isCheckedValue(activeCell.value));
    }

    /** Clicking the star that is already the rating clears it, as clicking a ticked box unticks it. */
    function setRating(tableId: string, col: number, row: number, stars: number): void {
        const cell = deps.findCell(tableId, col, row);
        if (!isEditableControl(cell, 'rating')) return;
        deps.pushUndo();
        cell.value = cell.value === stars ? null : stars;
        deps.recalculate();
    }

    /**
     * Applies a key pressed on a selected control to every control of its kind
     * in the selection: Space ticks or unticks checkboxes, 0 to 5 sets star
     * ratings. Returns whether the key was used, so the table does not also
     * start typing it into the cell.
     */
    function handleControlKey(key: string): boolean {
        if (key === ' ' && isActiveCellCheckbox()) {
            toggleSelectionCheckboxes();
            return true;
        }
        if (/^\d$/.test(key) && Number(key) <= MAX_RATING && findActiveControl('rating') !== null) {
            setSelectionControls('rating', key === '0' ? null : Number(key));
            return true;
        }
        return false;
    }

    function findActiveControl(type: ControlType): Cell | null {
        const active = state.activeCell.value;
        if (active === null) return null;
        const cell = deps.findCell(active.tableId, active.col, active.row);
        return isEditableControl(cell, type) ? cell : null;
    }

    function setSelectionControls(type: ControlType, value: CellValue): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        deps.pushUndo();
        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                const cell = deps.findCell(sr.tableId, colIdx, rowIdx);
                if (isEditableControl(cell, type)) cell.value = value;
            }
        }
        deps.recalculate();
    }

    return { toggleCheckbox, isActiveCellCheckbox, toggleSelectionCheckboxes, setRating, handleControlKey };
}

export function isControlType(type: CellDataType): type is ControlType {
    return type === 'checkbox' || type === 'rating';
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

/**
 * A whole number from 1 to 5 is that many stars, and 0 is none. "None" is held
 * as empty rather than 0 so that AVERAGE and COUNT skip what nobody has rated.
 */
function findRatingValue(value: string | number | boolean): ControlValue | null {
    if (typeof value === 'boolean') return null;
    const stars = typeof value === 'number' ? value : findTypedWholeNumber(value);
    if (stars === null || !Number.isInteger(stars) || stars < 0 || stars > MAX_RATING) return null;
    return { value: stars === 0 ? null : stars };
}

/** A plain whole number such as "3", not "$3" or "3.0", which are a price and a decimal. */
function findTypedWholeNumber(raw: string): number | null {
    const detected = detectType(raw);
    return detected.type === 'integer' ? detected.numericValue : null;
}

/** A formula decides its own result, so a control showing one cannot be clicked. */
function isEditableControl(cell: Cell | null, type: ControlType): cell is Cell {
    return cell !== null && cell.cellType === type && cell.formula === undefined;
}
