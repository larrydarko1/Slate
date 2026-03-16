// useClipboard — copy, cut, paste, and fill operations.
// Owns: internal clipboard buffer, copyCells, cutCells, pasteCells, fillCells.
// Does NOT own: cell access (useCells.ts), formula shifting (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { Cell, CellFormat, SelectionRange } from '../../types/spreadsheet'
import { generateId, createEmptyCell } from '../../types/spreadsheet'

interface ClipboardDeps {
    findTable: SpreadsheetHelpers['findTable']
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection']
    pushUndo: () => void
    getCell: (tableId: string, col: number, row: number) => Cell | null
    setCellValue: (tableId: string, col: number, row: number, raw: string) => void
    getDisplayValue: (tableId: string, col: number, row: number) => string
    getRawValue: (tableId: string, col: number, row: number) => string
    setCellFormat: (tableId: string, col: number, row: number, fmt: Partial<CellFormat>) => void
    shiftFormulaReferences: (formula: string, colDelta: number, rowDelta: number) => string
    recalculate: () => void
}

interface ClipboardCell {
    raw: string
    format?: CellFormat
}

export function createClipboard(state: SpreadsheetCoreState, deps: ClipboardDeps) {
    let clipboardData: ClipboardCell[][] | null = null
    let clipboardIsCut = false
    let clipboardSource: SelectionRange | null = null

    async function copyCells(cut = false): Promise<void> {
        const sr = deps.getNormalizedSelection()
        if (!sr) return

        const rows: ClipboardCell[][] = []
        const tsvRows: string[] = []

        for (let r = sr.startRow; r <= sr.endRow; r++) {
            const rowCells: ClipboardCell[] = []
            const tsvCols: string[] = []
            for (let c = sr.startCol; c <= sr.endCol; c++) {
                const raw = deps.getRawValue(sr.tableId, c, r)
                const cell = deps.getCell(sr.tableId, c, r)
                rowCells.push({
                    raw,
                    format: cell?.format ? { ...cell.format } : undefined,
                })
                tsvCols.push(deps.getDisplayValue(sr.tableId, c, r))
            }
            rows.push(rowCells)
            tsvRows.push(tsvCols.join('\t'))
        }

        clipboardData = rows
        clipboardIsCut = cut
        clipboardSource = { ...sr }

        try {
            await navigator.clipboard.writeText(tsvRows.join('\n'))
        } catch { /* ignore – internal clipboard still works */ }
    }

    async function cutCells(): Promise<void> {
        await copyCells(true)
    }

    async function pasteCells(): Promise<void> {
        if (!state.activeCell.value) return
        deps.pushUndo()
        const { tableId, col: startCol, row: startRow } = state.activeCell.value
        const t = deps.findTable(tableId)
        if (!t) return

        let data = clipboardData

        if (!data) {
            try {
                const text = await navigator.clipboard.readText()
                if (text) {
                    data = text.split('\n').map(line =>
                        line.split('\t').map(v => ({ raw: v }))
                    )
                }
            } catch { /* clipboard read blocked */ }
        }

        if (!data || data.length === 0) return

        // Expand table if necessary
        const neededRows = startRow + data.length
        const neededCols = startCol + Math.max(...data.map(r => r.length))
        while (t.rows.length < neededRows) {
            t.rows.push(t.columns.map(() => createEmptyCell()))
        }
        while (t.columns.length < neededCols) {
            t.columns.push({ id: generateId('col'), width: 120 })
            for (const row of t.rows) row.push(createEmptyCell())
        }

        const srcStartCol = clipboardSource?.startCol ?? 0
        const srcStartRow = clipboardSource?.startRow ?? 0
        for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
                const entry = data[r][c]
                let raw = entry.raw
                if (raw.startsWith('=') && clipboardSource) {
                    const colDelta = (startCol + c) - (srcStartCol + c)
                    const rowDelta = (startRow + r) - (srcStartRow + r)
                    if (colDelta !== 0 || rowDelta !== 0) {
                        raw = '=' + deps.shiftFormulaReferences(raw.substring(1), colDelta, rowDelta)
                    }
                }
                deps.setCellValue(tableId, startCol + c, startRow + r, raw)
                if (entry.format) {
                    deps.setCellFormat(tableId, startCol + c, startRow + r, entry.format)
                }
            }
        }

        if (clipboardIsCut && clipboardSource) {
            const src = clipboardSource
            for (let r = src.startRow; r <= src.endRow; r++) {
                for (let c = src.startCol; c <= src.endCol; c++) {
                    const destRow = startRow + (r - src.startRow)
                    const destCol = startCol + (c - src.startCol)
                    if (src.tableId === tableId && c === destCol && r === destRow) continue
                    deps.setCellValue(src.tableId, c, r, '')
                }
            }
            clipboardIsCut = false
            clipboardSource = null
        }

        state.selectionRange.value = {
            tableId,
            startCol,
            startRow,
            endCol: startCol + Math.max(...data.map(r => r.length)) - 1,
            endRow: startRow + data.length - 1,
        }

        deps.recalculate()
    }

    function fillCells(tableId: string, source: SelectionRange, target: SelectionRange): void {
        const t = deps.findTable(tableId)
        if (!t) return
        deps.pushUndo()

        const srcRows = source.endRow - source.startRow + 1
        const srcCols = source.endCol - source.startCol + 1

        const neededRows = target.endRow + 1
        const neededCols = target.endCol + 1
        while (t.rows.length < neededRows) {
            t.rows.push(t.columns.map(() => createEmptyCell()))
        }
        while (t.columns.length < neededCols) {
            t.columns.push({ id: generateId('col'), width: 120 })
            for (const row of t.rows) row.push(createEmptyCell())
        }

        for (let r = target.startRow; r <= target.endRow; r++) {
            for (let c = target.startCol; c <= target.endCol; c++) {
                if (r >= source.startRow && r <= source.endRow && c >= source.startCol && c <= source.endCol) continue
                const srcR = source.startRow + ((r - target.startRow) % srcRows)
                const srcC = source.startCol + ((c - target.startCol) % srcCols)
                const srcCell = deps.getCell(tableId, srcC, srcR)
                if (!srcCell) continue

                const colDelta = c - srcC
                const rowDelta = r - srcR

                if (srcCell.formula) {
                    const shifted = deps.shiftFormulaReferences(srcCell.formula, colDelta, rowDelta)
                    deps.setCellValue(tableId, c, r, '=' + shifted)
                } else {
                    const raw = deps.getRawValue(tableId, srcC, srcR)
                    deps.setCellValue(tableId, c, r, raw)
                }
                if (srcCell.format) {
                    deps.setCellFormat(tableId, c, r, { ...srcCell.format })
                }
            }
        }
        deps.recalculate()
    }

    return { copyCells, cutCells, pasteCells, fillCells }
}

export type SpreadsheetClipboard = ReturnType<typeof createClipboard>
