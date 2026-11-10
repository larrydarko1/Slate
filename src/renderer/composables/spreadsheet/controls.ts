/**
 * createControls — cells that are clicked rather than typed into: checkboxes,
 * star ratings and steppers.
 * Owns: clicking a control, the keyboard shortcuts' selection-wide changes,
 *       a stepper's limits, and the rules for what a control holds when typed
 *       into or given its type.
 * Does NOT own: the cell's general value and type handling (cells.ts), drawing
 *               the control (CellDisplay.vue).
 */
import { detectType, isCheckedValue, type CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Cell, CellValue, ControlLimits } from '@/renderer/types/spreadsheet';

/** Why a set of limits cannot be used, and which of its fields to fix. */
export type LimitsProblem = { field: keyof ControlLimits; message: string };

export type SpreadsheetControls = {
    toggleCheckbox: (tableId: string, col: number, row: number) => void;
    isActiveCellCheckbox: () => boolean;
    toggleSelectionCheckboxes: () => void;
    setRating: (tableId: string, col: number, row: number, stars: number) => void;
    stepStepper: (tableId: string, col: number, row: number, direction: StepDirection) => void;
    handleControlKey: (press: ControlKeyPress) => boolean;
    findActiveLimits: () => ControlLimits | null;
    setSelectionLimits: (limits: ControlLimits) => void;
};

type ControlType = Extract<CellDataType, 'checkbox' | 'rating' | 'stepper'>;

/** A value a control can hold, wrapped so that an empty control (null) differs from "no fit". */
type ControlValue = { value: CellValue };

/** Reads a value as one control would hold it, or null when that control cannot hold it. */
type ControlConverter = (value: string | number | boolean, limits: ControlLimits) => ControlValue | null;

/** The key a control is given; Alt tells stepping a stepper apart from moving the selection. */
type ControlKeyPress = { key: string; altKey: boolean };

/** One step down or up. */
type StepDirection = -1 | 1;

type ControlsDeps = {
    findCell: (tableId: string, col: number, row: number) => Cell | null;
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    recalculate: () => void;
};

export const MAX_RATING = 5;

const DEFAULT_LIMITS: ControlLimits = { min: 0, max: 100, step: 1 };

/** How each control reads a value it is given; a Record, so a new control cannot be left out. */
const CONVERTERS: Record<ControlType, ControlConverter> = {
    checkbox: findCheckboxValue,
    rating: findRatingValue,
    stepper: findStepperValue,
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

    /** An empty stepper's first step, either way, takes it to its minimum. */
    function stepStepper(tableId: string, col: number, row: number, direction: StepDirection): void {
        const cell = deps.findCell(tableId, col, row);
        if (!isEditableControl(cell, 'stepper')) return;
        const next = findSteppedValue(cell, direction);
        if (next === null) return;
        deps.pushUndo();
        cell.value = next;
        deps.recalculate();
    }

    /**
     * Applies a key pressed on a selected control to every control of its kind
     * in the selection: Space ticks or unticks checkboxes, 0 to 5 sets star
     * ratings, Alt+Up and Alt+Down step steppers. Returns whether the key was
     * used, so the table does not also type it into the cell or move.
     */
    function handleControlKey({ key, altKey }: ControlKeyPress): boolean {
        if (altKey && (key === 'ArrowUp' || key === 'ArrowDown') && findActiveControl('stepper') !== null) {
            stepSelectionSteppers(key === 'ArrowUp' ? 1 : -1);
            return true;
        }
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

    function findActiveLimits(): ControlLimits | null {
        const cell = findActiveControl('stepper');
        return cell === null ? null : limitsOf(cell);
    }

    /**
     * Gives every stepper in the selection `limits`, moving a value they leave
     * out to the nearer end, so no stepper holds a value it cannot show.
     */
    function setSelectionLimits(limits: ControlLimits): void {
        const problem = findLimitsProblem(limits);
        if (problem !== null) throw new Error(`Stepper limits refused: ${problem.message}`);
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        deps.pushUndo();
        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                const cell = deps.findCell(sr.tableId, colIdx, rowIdx);
                if (!isEditableControl(cell, 'stepper')) continue;
                cell.limits = { ...limits };
                if (typeof cell.value === 'number') {
                    cell.value = Math.min(limits.max, Math.max(limits.min, cell.value));
                }
            }
        }
        deps.recalculate();
    }

    function findActiveControl(type: ControlType): Cell | null {
        const active = state.activeCell.value;
        if (active === null) return null;
        const cell = deps.findCell(active.tableId, active.col, active.row);
        return isEditableControl(cell, type) ? cell : null;
    }

    /** Each stepper moves by its own step and stops at its own limits. */
    function stepSelectionSteppers(direction: StepDirection): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        const changes: { cell: Cell; value: number }[] = [];
        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                const cell = deps.findCell(sr.tableId, colIdx, rowIdx);
                const next = isEditableControl(cell, 'stepper') ? findSteppedValue(cell, direction) : null;
                if (cell !== null && next !== null) changes.push({ cell, value: next });
            }
        }
        // Nothing to undo when every stepper is already at its limit
        if (changes.length === 0) return;
        deps.pushUndo();
        for (const { cell, value } of changes) cell.value = value;
        deps.recalculate();
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

    return {
        toggleCheckbox,
        isActiveCellCheckbox,
        toggleSelectionCheckboxes,
        setRating,
        stepStepper,
        handleControlKey,
        findActiveLimits,
        setSelectionLimits,
    };
}

export function isControlType(type: CellDataType): type is ControlType {
    return type === 'checkbox' || type === 'rating' || type === 'stepper';
}

export function limitsOf(cell: Cell): ControlLimits {
    return cell.limits ?? DEFAULT_LIMITS;
}

/** The first thing wrong with `limits`, or null when a stepper can use them. */
export function findLimitsProblem(limits: ControlLimits): LimitsProblem | null {
    for (const field of ['min', 'max', 'step'] as const) {
        if (!Number.isFinite(limits[field])) return { field, message: 'Enter a number' };
    }
    if (limits.max <= limits.min) return { field: 'max', message: 'Must be more than the minimum' };
    if (limits.step <= 0) return { field: 'step', message: 'Must be more than 0' };
    return null;
}

/** Whether a stepper with `limits` can show `value`: a number from its minimum to its maximum. */
export function isWithinLimits(value: CellValue, limits: ControlLimits): value is number {
    return typeof value === 'number' && value >= limits.min && value <= limits.max;
}

/**
 * What a control holds after `raw` is typed into it, or null when `raw` is not
 * something the control can show and the cell becomes an ordinary one.
 * Clearing keeps the control, empty: the control goes only by changing the type.
 */
export function findTypedControlValue(type: ControlType, raw: string, limits: ControlLimits): ControlValue | null {
    if (raw === '') return { value: null };
    return findControlValue(type, raw, limits);
}

/**
 * What a value becomes when its cell is made a control, or null when it has no
 * control to become and the cell is left as it is.
 */
export function findControlValue(
    type: ControlType,
    value: string | number | boolean,
    limits: ControlLimits,
): ControlValue | null {
    return CONVERTERS[type](value, limits);
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

/**
 * Any plain number within the limits, kept as it is even off the step: the
 * step only sets how far the buttons move it. "$3" and "30%" are a price and a
 * share, not a count to step through.
 */
function findStepperValue(value: string | number | boolean, limits: ControlLimits): ControlValue | null {
    if (typeof value === 'boolean') return null;
    const number = typeof value === 'number' ? value : findPlainNumber(detectType(value));
    return isWithinLimits(number, limits) ? { value: number } : null;
}

function findPlainNumber(detected: ReturnType<typeof detectType>): number | null {
    return detected.type === 'integer' || detected.type === 'float' ? detected.numericValue : null;
}

/** The value one step from where `cell` is, kept within its limits, or null when it is already at the end. */
function findSteppedValue(cell: Cell, direction: StepDirection): number | null {
    const limits = limitsOf(cell);
    if (!isWithinLimits(cell.value, limits)) return cell.value === null ? limits.min : null;
    // Rounded, or 0.1 + 0.2 would show as 0.30000000000000004
    const moved = parseFloat((cell.value + direction * limits.step).toFixed(10));
    const next = Math.min(limits.max, Math.max(limits.min, moved));
    return next === cell.value ? null : next;
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
