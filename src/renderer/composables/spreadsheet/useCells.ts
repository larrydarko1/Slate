// useCells — cell access, value setting, formatting, type management, and notes.
// Owns: getCell, setCellValue, display/raw values, type/format ops, cell notes.
// Does NOT own: editing state (useEditing.ts), selection (useSelection.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { Cell, CellFormat } from '../../types/spreadsheet'
import type { CellDataType } from '../../engine/cellTypes'
import { generateId, createEmptyCell } from '../../types/spreadsheet'
import { detectType, formatCellDisplay, getTypeAlignment } from '../../engine/cellTypes'

interface CellsDeps {
    findTable: SpreadsheetHelpers['findTable']
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection']
    pushUndo: () => void
    recalculate: () => void
}

export function createCells(state: SpreadsheetCoreState, deps: CellsDeps) {

    function getCell(tableId: string, col: number, row: number): Cell | null {
        const t = deps.findTable(tableId)
        if (!t || row < 0 || row >= t.rows.length || col < 0 || col >= t.columns.length) return null
        return t.rows[row][col]
    }

    function setCellValue(tableId: string, col: number, row: number, raw: string): void {
        deps.pushUndo()
        const t = deps.findTable(tableId)
        if (!t) return

        while (t.rows.length <= row) t.rows.push(t.columns.map(() => createEmptyCell()))
        while (t.columns.length <= col) {
            t.columns.push({ id: generateId('col'), width: 120 })
            for (const r of t.rows) r.push(createEmptyCell())
        }

        const cell = t.rows[row][col]

        if (raw.startsWith('=')) {
            cell.formula = raw.substring(1)
            cell.value = null
            cell.cellType = 'empty'
        } else {
            cell.formula = undefined
            cell.computed = undefined
            cell.computedType = undefined

            if (raw === '') {
                cell.value = null
                cell.cellType = 'empty'
            } else {
                const detected = detectType(raw)
                cell.cellType = detected.type

                if (detected.numericValue !== null && detected.type !== 'text') {
                    cell.value = detected.numericValue
                } else if (detected.type === 'boolean') {
                    cell.value = detected.rawInput.toLowerCase() === 'true'
                } else if (detected.type === 'text') {
                    cell.value = detected.rawInput
                } else {
                    cell.value = raw
                }
            }
        }

        deps.recalculate()
    }

    function getDisplayValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''

        const v = cell.formula != null ? cell.computed : cell.value
        const t = cell.formula != null ? (cell.computedType ?? cell.cellType) : cell.cellType
        const dp = cell.format?.decimalPlaces

        if (v === null || v === undefined) return ''
        if (typeof v === 'string' && v.startsWith('#')) return v

        return formatCellDisplay(v, t, dp)
    }

    function getRawValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''
        if (cell.formula != null) return '=' + cell.formula
        if (cell.value === null) return ''
        return String(cell.value)
    }

    function getCellType(tableId: string, col: number, row: number): CellDataType {
        const cell = getCell(tableId, col, row)
        if (!cell) return 'empty'
        if (cell.formula != null) return cell.computedType ?? cell.cellType ?? 'empty'
        return cell.cellType ?? 'empty'
    }

    function getCellAlignment(tableId: string, col: number, row: number): 'left' | 'right' | 'center' {
        const cell = getCell(tableId, col, row)
        if (!cell) return 'left'
        if (cell.format?.align) return cell.format.align
        const t = cell.formula != null ? (cell.computedType ?? cell.cellType) : cell.cellType
        return getTypeAlignment(t)
    }

    function setCellType(tableId: string, col: number, row: number, newType: CellDataType): void {
        const cell = getCell(tableId, col, row)
        if (!cell) return
        deps.pushUndo()

        cell.cellType = newType
        if (cell.formula != null) {
            cell.computedType = newType
        }

        if (cell.value !== null && cell.value !== undefined && !cell.formula) {
            if (typeof cell.value === 'number') {
                if (newType === 'integer') {
                    cell.value = Math.round(cell.value)
                }
            } else if (typeof cell.value === 'string' && newType !== 'text') {
                const detected = detectType(cell.value)
                if (detected.numericValue !== null) {
                    cell.value = detected.numericValue
                }
            }
        }

        deps.recalculate()
    }

    function setCellFormat(tableId: string, col: number, row: number, fmt: Partial<CellFormat>): void {
        deps.pushUndo()
        const cell = getCell(tableId, col, row)
        if (!cell) return
        cell.format = { ...cell.format, ...fmt }
    }

    function setSelectionFormat(fmt: Partial<CellFormat>): void {
        const sr = deps.getNormalizedSelection()
        if (!sr) return
        deps.pushUndo()
        for (let r = sr.startRow; r <= sr.endRow; r++) {
            for (let c = sr.startCol; c <= sr.endCol; c++) {
                setCellFormat(sr.tableId, c, r, fmt)
            }
        }
    }

    function getActiveCellFormat(): CellFormat | undefined {
        if (!state.activeCell.value) return undefined
        const cell = getCell(state.activeCell.value.tableId, state.activeCell.value.col, state.activeCell.value.row)
        return cell?.format
    }

    // ── Cell notes ───────────────────────────────────────────────────────────

    function setCellNote(tableId: string, col: number, row: number, note: string): void {
        deps.pushUndo()
        const cell = getCell(tableId, col, row)
        if (!cell) return
        cell.note = note || undefined
    }

    function getCellNote(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        return cell?.note ?? ''
    }

    function removeCellNote(tableId: string, col: number, row: number): void {
        deps.pushUndo()
        const cell = getCell(tableId, col, row)
        if (cell) cell.note = undefined
    }

    function cellHasNote(tableId: string, col: number, row: number): boolean {
        const cell = getCell(tableId, col, row)
        return !!(cell?.note)
    }

    return {
        getCell, setCellValue, getDisplayValue, getRawValue,
        getCellType, getCellAlignment, setCellType,
        setCellFormat, setSelectionFormat, getActiveCellFormat,
        setCellNote, getCellNote, removeCellNote, cellHasNote,
    }
}

export type SpreadsheetCells = ReturnType<typeof createCells>
