import type { CellDataType } from '../engine/cellTypes'

export type CellValue = string | number | boolean | null

export interface Cell {
    value: CellValue
    formula?: string        // Formula body (without leading '=')
    computed?: CellValue     // Cached result of formula evaluation
    cellType: CellDataType   // Detected / assigned data type
    computedType?: CellDataType  // Resolved type after formula evaluation
    format?: CellFormat
}

export interface CellFormat {
    bold?: boolean
    italic?: boolean
    align?: 'left' | 'center' | 'right'
    textColor?: string
    bgColor?: string
}

export interface MergedRegion {
    startCol: number
    startRow: number
    endCol: number
    endRow: number
}

export interface SelectionRange {
    tableId: string
    startCol: number
    startRow: number
    endCol: number
    endRow: number
}

export interface Column {
    id: string
    width: number
}

export interface SpreadsheetTable {
    id: string
    name: string
    x: number
    y: number
    zIndex: number
    columns: Column[]
    rows: Cell[][]            // rows[rowIndex][colIndex]
    headerRows: number
    mergedRegions: MergedRegion[]
}

export interface CellReference {
    tableId: string
    col: number
    row: number
}

export interface Sheet {
    id: string
    name: string
    tables: SpreadsheetTable[]
}

// ── Helpers ──

let _idCounter = 0

export function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${++_idCounter}`
}

export function indexToColumnLetter(index: number): string {
    let result = ''
    let n = index
    while (n >= 0) {
        result = String.fromCharCode(65 + (n % 26)) + result
        n = Math.floor(n / 26) - 1
    }
    return result
}

export function columnLetterToIndex(letter: string): number {
    let result = 0
    for (let i = 0; i < letter.length; i++) {
        result = result * 26 + (letter.charCodeAt(i) - 64)
    }
    return result - 1
}

export function createEmptyCell(): Cell {
    return { value: null, cellType: 'empty' }
}

export function createDefaultTable(x: number, y: number, name: string): SpreadsheetTable {
    const colCount = 5
    const rowCount = 8
    const columns: Column[] = Array.from({ length: colCount }, () => ({
        id: generateId('col'),
        width: 120,
    }))
    const rows: Cell[][] = Array.from({ length: rowCount }, () =>
        Array.from({ length: colCount }, () => createEmptyCell()),
    )
    return {
        id: generateId('tbl'),
        name,
        x,
        y,
        zIndex: 0,
        columns,
        rows,
        headerRows: 1,
        mergedRegions: [],
    }
}
