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

export interface TextBox {
    id: string
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    text: string
    fontSize: number
    fontWeight: 'normal' | 'bold'
    fontStyle: 'normal' | 'italic'
    textColor: string
    bgColor: string
    align: 'left' | 'center' | 'right'
    borderColor: string
    borderWidth: number
    borderRadius: number
}

export interface Sheet {
    id: string
    name: string
    tables: SpreadsheetTable[]
}

export interface Canvas {
    id: string
    name: string
    tables: SpreadsheetTable[]
    textBoxes: TextBox[]
    canvasOffset: { x: number; y: number }
    canvasZoom: number
}

/** Zoom limits */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4.0
export const ZOOM_STEP = 0.1
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]

/** Maximum number of canvases allowed per file */
export const MAX_CANVASES = 10

export function createDefaultCanvas(name: string): Canvas {
    return {
        id: generateId('canvas'),
        name,
        tables: [],
        textBoxes: [],
        canvasOffset: { x: 0, y: 0 },
        canvasZoom: 1.0,
    }
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

export function createDefaultTextBox(x: number, y: number): TextBox {
    return {
        id: generateId('txt'),
        x,
        y,
        width: 200,
        height: 80,
        zIndex: 0,
        text: '',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textColor: '',
        bgColor: '',
        align: 'left',
        borderColor: '',
        borderWidth: 0,
        borderRadius: 6,
    }
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
