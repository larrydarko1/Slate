/**
 * createCells — cell access, value setting, formatting, type management, and notes.
 * Owns: findCell, setCellValue, display/raw values, type/format ops, cell notes.
 * Does NOT own: editing state (useEditing.ts), selection (useSelection.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { Cell, CellFormat } from '@/renderer/types/spreadsheet';
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { generateId, createEmptyCell } from '@/renderer/types/spreadsheet';
import { detectType, formatCellDisplay, getTypeAlignment } from '@/renderer/composables/spreadsheet/engine/cellTypes';

export type SpreadsheetCells = {
    findCell: (tableId: string, col: number, row: number) => Cell | null;
    setCellValue: (tableId: string, col: number, row: number, raw: string) => void;
    getDisplayValue: (tableId: string, col: number, row: number) => string;
    getRawValue: (tableId: string, col: number, row: number) => string;
    getCellType: (tableId: string, col: number, row: number) => CellDataType;
    getCellAlignment: (tableId: string, col: number, row: number) => 'left' | 'right' | 'center';
    setCellType: (tableId: string, col: number, row: number, newType: CellDataType) => void;
    setCellFormat: (tableId: string, col: number, row: number, fmt: Partial<CellFormat>) => void;
    setSelectionFormat: (fmt: Partial<CellFormat>) => void;
    findActiveCellFormat: () => CellFormat | null;
    setCellNote: (tableId: string, col: number, row: number, note: string) => void;
    getCellNote: (tableId: string, col: number, row: number) => string;
    removeCellNote: (tableId: string, col: number, row: number) => void;
    cellHasNote: (tableId: string, col: number, row: number) => boolean;
};

type CellsDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    recalculate: () => void;
};

export function createCells(state: SpreadsheetCoreState, deps: CellsDeps): SpreadsheetCells {
    function findCell(tableId: string, col: number, row: number): Cell | null {
        const table = deps.findTable(tableId);
        if (table === null || row < 0 || row >= table.rows.length || col < 0 || col >= table.columns.length)
            return null;
        return table.rows[row][col];
    }

    function setCellValue(tableId: string, col: number, row: number, raw: string): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;

        while (table.rows.length <= row) table.rows.push(table.columns.map((): Cell => createEmptyCell()));
        while (table.columns.length <= col) {
            table.columns.push({ id: generateId('col'), width: 120 });
            for (const tableRow of table.rows) tableRow.push(createEmptyCell());
        }

        const cell = table.rows[row][col];

        if (raw.startsWith('=')) {
            cell.formula = raw.substring(1);
            cell.value = null;
            cell.cellType = 'empty';
        } else {
            cell.formula = undefined;
            cell.computed = undefined;
            cell.computedType = undefined;

            if (raw === '') {
                cell.value = null;
                cell.cellType = 'empty';
            } else {
                const detected = detectType(raw);
                cell.cellType = detected.type;

                if (detected.numericValue !== null && detected.type !== 'text') {
                    cell.value = detected.numericValue;
                } else if (detected.type === 'boolean') {
                    cell.value = detected.rawInput.toLowerCase() === 'true';
                } else if (detected.type === 'text') {
                    cell.value = detected.rawInput;
                } else {
                    cell.value = raw;
                }
            }
        }

        deps.recalculate();
    }

    function getDisplayValue(tableId: string, col: number, row: number): string {
        const cell = findCell(tableId, col, row);
        if (cell === null) return '';

        const raw = cell.formula !== undefined ? cell.computed : cell.value;
        const cellType = cell.formula !== undefined ? (cell.computedType ?? cell.cellType) : cell.cellType;
        const dp = cell.format?.decimalPlaces;

        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'string' && raw.startsWith('#')) return raw;

        return formatCellDisplay(raw, cellType, dp);
    }

    function getRawValue(tableId: string, col: number, row: number): string {
        const cell = findCell(tableId, col, row);
        if (cell === null) return '';
        if (cell.formula !== undefined) return '=' + cell.formula;
        if (cell.value === null) return '';
        return String(cell.value);
    }

    function getCellType(tableId: string, col: number, row: number): CellDataType {
        const cell = findCell(tableId, col, row);
        if (cell === null) return 'empty';
        if (cell.formula !== undefined) return cell.computedType ?? cell.cellType ?? 'empty';
        return cell.cellType ?? 'empty';
    }

    function getCellAlignment(tableId: string, col: number, row: number): 'left' | 'right' | 'center' {
        const cell = findCell(tableId, col, row);
        if (cell === null) return 'left';
        if (cell.format?.align !== undefined) return cell.format.align;
        const cellType = cell.formula !== undefined ? (cell.computedType ?? cell.cellType) : cell.cellType;
        return getTypeAlignment(cellType);
    }

    function setCellType(tableId: string, col: number, row: number, newType: CellDataType): void {
        const cell = findCell(tableId, col, row);
        if (cell === null) return;
        deps.pushUndo();

        cell.cellType = newType;
        if (cell.formula !== undefined) {
            cell.computedType = newType;
        }

        if (cell.value !== null && cell.value !== undefined && cell.formula === undefined) {
            if (typeof cell.value === 'number') {
                if (newType === 'integer') {
                    cell.value = Math.round(cell.value);
                }
            } else if (typeof cell.value === 'string' && newType !== 'text') {
                const detected = detectType(cell.value);
                if (detected.numericValue !== null) {
                    cell.value = detected.numericValue;
                }
            }
        }

        deps.recalculate();
    }

    function setCellFormat(tableId: string, col: number, row: number, fmt: Partial<CellFormat>): void {
        deps.pushUndo();
        const cell = findCell(tableId, col, row);
        if (cell === null) return;
        cell.format = { ...cell.format, ...fmt };
    }

    function setSelectionFormat(fmt: Partial<CellFormat>): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        deps.pushUndo();
        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                setCellFormat(sr.tableId, colIdx, rowIdx, fmt);
            }
        }
    }

    function findActiveCellFormat(): CellFormat | null {
        const active = state.activeCell.value;
        if (active === null) return null;
        const cell = findCell(active.tableId, active.col, active.row);
        return cell?.format ?? null;
    }

    // ── Cell notes ───────────────────────────────────────────────────────────

    function setCellNote(tableId: string, col: number, row: number, note: string): void {
        deps.pushUndo();
        const cell = findCell(tableId, col, row);
        if (cell === null) return;
        cell.note = note !== '' ? note : undefined;
    }

    function getCellNote(tableId: string, col: number, row: number): string {
        const cell = findCell(tableId, col, row);
        return cell?.note ?? '';
    }

    function removeCellNote(tableId: string, col: number, row: number): void {
        deps.pushUndo();
        const cell = findCell(tableId, col, row);
        if (cell !== null) cell.note = undefined;
    }

    function cellHasNote(tableId: string, col: number, row: number): boolean {
        const cell = findCell(tableId, col, row);
        return cell?.note !== undefined;
    }

    return {
        findCell,
        setCellValue,
        getDisplayValue,
        getRawValue,
        getCellType,
        getCellAlignment,
        setCellType,
        setCellFormat,
        setSelectionFormat,
        findActiveCellFormat,
        setCellNote,
        getCellNote,
        removeCellNote,
        cellHasNote,
    };
}
