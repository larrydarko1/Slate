import { ref, type InjectionKey } from 'vue'
import type { SpreadsheetTable, Cell, CellValue, CellReference, MergedRegion, SelectionRange } from '../types/spreadsheet'
import { generateId, createDefaultTable, createEmptyCell } from '../types/spreadsheet'
import { evaluateFormulaTyped } from '../engine/formula'
import type { CellDataType } from '../engine/cellTypes'
import { detectType, formatCellDisplay, getTypeAlignment } from '../engine/cellTypes'

export function useSpreadsheet() {
    const tables = ref<SpreadsheetTable[]>([])
    const activeCell = ref<CellReference | null>(null)
    const selectionRange = ref<SelectionRange | null>(null)
    const isEditing = ref(false)
    const editValue = ref('')
    const canvasOffset = ref({ x: 0, y: 0 })
    let maxZ = 0
    let tableCount = 0

    // ── Table CRUD ──

    function addTable() {
        tableCount++
        const offsetIdx = tables.value.length
        const x = -canvasOffset.value.x + 80 + offsetIdx * 40
        const y = -canvasOffset.value.y + 60 + offsetIdx * 40
        const t = createDefaultTable(x, y, `Table ${tableCount}`)
        t.zIndex = ++maxZ
        tables.value.push(t)
    }

    function removeTable(tableId: string) {
        tables.value = tables.value.filter(t => t.id !== tableId)
        if (activeCell.value?.tableId === tableId) activeCell.value = null
    }

    function bringToFront(tableId: string) {
        const t = findTable(tableId)
        if (t) t.zIndex = ++maxZ
    }

    function renameTable(tableId: string, name: string) {
        const t = findTable(tableId)
        if (t) t.name = name
    }

    function moveTable(tableId: string, x: number, y: number) {
        const t = findTable(tableId)
        if (t) { t.x = x; t.y = y }
    }

    // ── Row / Column operations ──

    function addRow(tableId: string) {
        const t = findTable(tableId)
        if (!t) return
        t.rows.push(t.columns.map(() => createEmptyCell()))
    }

    function addColumn(tableId: string) {
        const t = findTable(tableId)
        if (!t) return
        t.columns.push({ id: generateId('col'), width: 120 })
        for (const row of t.rows) row.push(createEmptyCell())
    }

    function deleteRow(tableId: string, rowIdx: number) {
        const t = findTable(tableId)
        if (!t || t.rows.length <= 1) return
        // Remove merges that collapse to nothing, shrink others
        t.mergedRegions = t.mergedRegions
            .map(m => {
                if (rowIdx < m.startRow) return { ...m, startRow: m.startRow - 1, endRow: m.endRow - 1 }
                if (rowIdx > m.endRow) return m
                // Row is inside the merge
                if (m.startRow === m.endRow) return null // single-row merge gone
                return { ...m, endRow: m.endRow - 1 }
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol))
        t.rows.splice(rowIdx, 1)
        if (activeCell.value?.tableId === tableId && activeCell.value.row >= t.rows.length) {
            activeCell.value.row = t.rows.length - 1
        }
        recalculate()
    }

    function deleteColumn(tableId: string, colIdx: number) {
        const t = findTable(tableId)
        if (!t || t.columns.length <= 1) return
        // Remove merges that collapse to nothing, shrink others
        t.mergedRegions = t.mergedRegions
            .map(m => {
                if (colIdx < m.startCol) return { ...m, startCol: m.startCol - 1, endCol: m.endCol - 1 }
                if (colIdx > m.endCol) return m
                // Col is inside the merge
                if (m.startCol === m.endCol) return null // single-col merge gone
                return { ...m, endCol: m.endCol - 1 }
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol))
        t.columns.splice(colIdx, 1)
        for (const row of t.rows) row.splice(colIdx, 1)
        if (activeCell.value?.tableId === tableId && activeCell.value.col >= t.columns.length) {
            activeCell.value.col = t.columns.length - 1
        }
        recalculate()
    }

    function insertRowAt(tableId: string, rowIdx: number) {
        const t = findTable(tableId)
        if (!t) return
        // Shift merged regions
        t.mergedRegions = t.mergedRegions.map(m => {
            if (rowIdx <= m.startRow) return { ...m, startRow: m.startRow + 1, endRow: m.endRow + 1 }
            if (rowIdx <= m.endRow) return { ...m, endRow: m.endRow + 1 }
            return m
        })
        t.rows.splice(rowIdx, 0, t.columns.map(() => createEmptyCell()))
        recalculate()
    }

    function insertColumnAt(tableId: string, colIdx: number) {
        const t = findTable(tableId)
        if (!t) return
        // Shift merged regions
        t.mergedRegions = t.mergedRegions.map(m => {
            if (colIdx <= m.startCol) return { ...m, startCol: m.startCol + 1, endCol: m.endCol + 1 }
            if (colIdx <= m.endCol) return { ...m, endCol: m.endCol + 1 }
            return m
        })
        t.columns.splice(colIdx, 0, { id: generateId('col'), width: 120 })
        for (const row of t.rows) row.splice(colIdx, 0, createEmptyCell())
        recalculate()
    }

    // ── Cell access ──

    function getCell(tableId: string, col: number, row: number): Cell | null {
        const t = findTable(tableId)
        if (!t || row < 0 || row >= t.rows.length || col < 0 || col >= t.columns.length) return null
        return t.rows[row][col]
    }

    function setCellValue(tableId: string, col: number, row: number, raw: string) {
        const t = findTable(tableId)
        if (!t) return

        // Ensure cell exists
        while (t.rows.length <= row) t.rows.push(t.columns.map(() => createEmptyCell()))
        while (t.columns.length <= col) {
            t.columns.push({ id: generateId('col'), width: 120 })
            for (const r of t.rows) r.push(createEmptyCell())
        }

        const cell = t.rows[row][col]

        if (raw.startsWith('=')) {
            cell.formula = raw.substring(1)
            cell.value = null
            cell.cellType = 'empty'  // will be resolved during recalculate
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

        recalculate()
    }

    function getDisplayValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''

        const v = cell.formula != null ? cell.computed : cell.value
        const t = cell.formula != null ? (cell.computedType ?? cell.cellType) : cell.cellType

        if (v === null || v === undefined) return ''

        // Error strings pass through
        if (typeof v === 'string' && v.startsWith('#')) return v

        return formatCellDisplay(v, t)
    }

    /** Get the effective type of a cell (considering formula results) */
    function getCellType(tableId: string, col: number, row: number): CellDataType {
        const cell = getCell(tableId, col, row)
        if (!cell) return 'empty'
        if (cell.formula != null) return cell.computedType ?? cell.cellType ?? 'empty'
        return cell.cellType ?? 'empty'
    }

    /** Get type-based alignment for a cell */
    function getCellAlignment(tableId: string, col: number, row: number): 'left' | 'right' | 'center' {
        const cell = getCell(tableId, col, row)
        if (!cell) return 'left'
        // Explicit format alignment takes priority
        if (cell.format?.align) return cell.format.align
        const t = cell.formula != null ? (cell.computedType ?? cell.cellType) : cell.cellType
        return getTypeAlignment(t)
    }

    /** Set cell type manually (e.g. from toolbar dropdown) */
    function setCellType(tableId: string, col: number, row: number, newType: CellDataType) {
        const cell = getCell(tableId, col, row)
        if (!cell) return

        cell.cellType = newType

        // Try to re-interpret the value under the new type
        if (cell.value !== null && cell.value !== undefined && !cell.formula) {
            if (typeof cell.value === 'number') {
                // Number to integer: round
                if (newType === 'integer') {
                    cell.value = Math.round(cell.value)
                }
                // Other numeric types: keep underlying number, display changes
            } else if (typeof cell.value === 'string' && newType !== 'text') {
                // Try parsing text as the new type
                const detected = detectType(cell.value)
                if (detected.numericValue !== null) {
                    cell.value = detected.numericValue
                }
            }
        }

        recalculate()
    }

    function getRawValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''
        if (cell.formula != null) return '=' + cell.formula
        if (cell.value === null) return ''
        return String(cell.value)
    }

    /** Set format properties on a single cell */
    function setCellFormat(tableId: string, col: number, row: number, fmt: Partial<import('../types/spreadsheet').CellFormat>) {
        const cell = getCell(tableId, col, row)
        if (!cell) return
        cell.format = { ...cell.format, ...fmt }
    }

    /** Apply format to all cells in the current selection */
    function setSelectionFormat(fmt: Partial<import('../types/spreadsheet').CellFormat>) {
        const sr = getNormalizedSelection()
        if (!sr) return
        for (let r = sr.startRow; r <= sr.endRow; r++) {
            for (let c = sr.startCol; c <= sr.endCol; c++) {
                setCellFormat(sr.tableId, c, r, fmt)
            }
        }
    }

    /** Get format of the active cell */
    function getActiveCellFormat(): import('../types/spreadsheet').CellFormat | undefined {
        if (!activeCell.value) return undefined
        const cell = getCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
        return cell?.format
    }

    // ── Editing state ──

    function selectCell(tableId: string, col: number, row: number) {
        if (isEditing.value) commitEdit()
        activeCell.value = { tableId, col, row }
        selectionRange.value = { tableId, startCol: col, startRow: row, endCol: col, endRow: row }
        bringToFront(tableId)
    }

    function extendSelection(tableId: string, col: number, row: number) {
        if (!activeCell.value || activeCell.value.tableId !== tableId) return
        if (isEditing.value) commitEdit()
        const sr = selectionRange.value!
        selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: sr.startRow,
            endCol: col,
            endRow: row,
        }
    }

    /** Return a normalized (min/max) selection range */
    function getNormalizedSelection(): SelectionRange | null {
        const sr = selectionRange.value
        if (!sr) return null
        return {
            tableId: sr.tableId,
            startCol: Math.min(sr.startCol, sr.endCol),
            startRow: Math.min(sr.startRow, sr.endRow),
            endCol: Math.max(sr.startCol, sr.endCol),
            endRow: Math.max(sr.startRow, sr.endRow),
        }
    }

    function isInSelection(tableId: string, col: number, row: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        return col >= sr.startCol && col <= sr.endCol && row >= sr.startRow && row <= sr.endRow
    }

    function hasMultiCellSelection(): boolean {
        const sr = getNormalizedSelection()
        if (!sr) return false
        return sr.startCol !== sr.endCol || sr.startRow !== sr.endRow
    }

    function startEditing(initialValue?: string) {
        if (!activeCell.value) return
        isEditing.value = true
        const { tableId, col, row } = activeCell.value
        editValue.value = initialValue ?? getRawValue(tableId, col, row)
    }

    function commitEdit() {
        if (!activeCell.value || !isEditing.value) return
        const { tableId, col, row } = activeCell.value
        setCellValue(tableId, col, row, editValue.value)
        isEditing.value = false
    }

    function cancelEdit() {
        isEditing.value = false
        editValue.value = ''
    }

    function clearActiveCell() {
        if (!activeCell.value) return
        const { tableId, col, row } = activeCell.value
        setCellValue(tableId, col, row, '')
    }

    // ── Merge / Unmerge ──

    function getMergedRegionAt(tableId: string, col: number, row: number): MergedRegion | null {
        const t = findTable(tableId)
        if (!t) return null
        return t.mergedRegions.find(
            m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow
        ) ?? null
    }

    function isMergedOrigin(tableId: string, col: number, row: number): MergedRegion | null {
        const t = findTable(tableId)
        if (!t) return null
        return t.mergedRegions.find(m => m.startCol === col && m.startRow === row) ?? null
    }

    function isCellHiddenByMerge(tableId: string, col: number, row: number): boolean {
        const m = getMergedRegionAt(tableId, col, row)
        if (!m) return false
        return !(m.startCol === col && m.startRow === row)
    }

    function mergeCells(tableId: string, startCol: number, startRow: number, endCol: number, endRow: number) {
        const t = findTable(tableId)
        if (!t) return
        if (startCol === endCol && startRow === endRow) return // single cell, nothing to merge

        // Ensure correct order
        const sc = Math.min(startCol, endCol)
        const sr = Math.min(startRow, endRow)
        const ec = Math.max(startCol, endCol)
        const er = Math.max(startRow, endRow)

        // Remove any existing merge regions that overlap
        t.mergedRegions = t.mergedRegions.filter(
            m => m.endCol < sc || m.startCol > ec || m.endRow < sr || m.startRow > er
        )

        // Keep value of top-left cell, clear all others
        for (let r = sr; r <= er; r++) {
            for (let c = sc; c <= ec; c++) {
                if (r === sr && c === sc) continue
                if (t.rows[r]?.[c]) {
                    t.rows[r][c] = createEmptyCell()
                }
            }
        }

        t.mergedRegions.push({ startCol: sc, startRow: sr, endCol: ec, endRow: er })
    }

    function unmergeCells(tableId: string, col: number, row: number) {
        const t = findTable(tableId)
        if (!t) return
        const idx = t.mergedRegions.findIndex(
            m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow
        )
        if (idx >= 0) t.mergedRegions.splice(idx, 1)
    }

    function mergeSelection() {
        const sr = getNormalizedSelection()
        if (!sr) return
        mergeCells(sr.tableId, sr.startCol, sr.startRow, sr.endCol, sr.endRow)
    }

    function unmergeSelection() {
        const sr = getNormalizedSelection()
        if (!sr) return
        // Unmerge all regions that intersect the selection
        const t = findTable(sr.tableId)
        if (!t) return
        t.mergedRegions = t.mergedRegions.filter(
            m => m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow
        )
    }

    function selectionHasMerge(): boolean {
        const sr = getNormalizedSelection()
        if (!sr) return false
        const t = findTable(sr.tableId)
        if (!t) return false
        return t.mergedRegions.some(
            m => !(m.endCol < sr.startCol || m.startCol > sr.endCol || m.endRow < sr.startRow || m.startRow > sr.endRow)
        )
    }

    // ── Navigation ──

    function moveSelection(dCol: number, dRow: number) {
        if (!activeCell.value) return
        const t = findTable(activeCell.value.tableId)
        if (!t) return
        const newCol = Math.max(0, Math.min(t.columns.length - 1, activeCell.value.col + dCol))
        const newRow = Math.max(0, Math.min(t.rows.length - 1, activeCell.value.row + dRow))
        activeCell.value = { tableId: activeCell.value.tableId, col: newCol, row: newRow }
    }

    // ── Recalculation ──

    function recalculate() {
        const evaluating = new Set<string>()

        function resolveCellValue(tableId: string, col: number, row: number): CellValue {
            const key = `${tableId}:${col}:${row}`
            if (evaluating.has(key)) return '#CIRCULAR!'

            const cell = getCell(tableId, col, row)
            if (!cell) return null

            if (cell.formula != null) {
                evaluating.add(key)
                try {
                    const result = evaluateFormulaTyped(cell.formula, {
                        getCellValue: (c, r) => resolveCellValue(tableId, c, r),
                        getCellType: (c, r) => {
                            const refCell = getCell(tableId, c, r)
                            if (!refCell) return 'empty'
                            if (refCell.formula != null) {
                                // Ensure the referred cell is evaluated first
                                resolveCellValue(tableId, c, r)
                                return refCell.computedType ?? refCell.cellType ?? 'empty'
                            }
                            return refCell.cellType ?? 'empty'
                        },
                        getCellRange: (sc, sr, ec, er) => {
                            const vals: CellValue[] = []
                            for (let r = sr; r <= er; r++)
                                for (let c = sc; c <= ec; c++)
                                    vals.push(resolveCellValue(tableId, c, r))
                            return vals
                        },
                        getCellRangeTypes: (sc, sr, ec, er) => {
                            const types: CellDataType[] = []
                            for (let r = sr; r <= er; r++)
                                for (let c = sc; c <= ec; c++) {
                                    const refCell = getCell(tableId, c, r)
                                    if (!refCell) { types.push('empty'); continue }
                                    if (refCell.formula != null) {
                                        resolveCellValue(tableId, c, r)
                                        types.push(refCell.computedType ?? refCell.cellType ?? 'empty')
                                    } else {
                                        types.push(refCell.cellType ?? 'empty')
                                    }
                                }
                            return types
                        },
                    })
                    cell.computed = result.value
                    cell.computedType = result.type
                } catch {
                    cell.computed = '#ERROR!'
                    cell.computedType = 'text'
                }
                evaluating.delete(key)
                return cell.computed!
            }

            return cell.value
        }

        for (const table of tables.value) {
            for (let r = 0; r < table.rows.length; r++)
                for (let c = 0; c < table.columns.length; c++)
                    if (table.rows[r][c].formula != null)
                        resolveCellValue(table.id, c, r)
        }
    }

    // ── Helpers ──

    function findTable(id: string): SpreadsheetTable | undefined {
        return tables.value.find(t => t.id === id)
    }

    // ── File Operations ──

    const currentFilePath = ref<string | null>(null)

    function serializeState() {
        return JSON.stringify({
            version: '1.0',
            tables: tables.value,
            canvasOffset: canvasOffset.value
        }, null, 2)
    }

    function deserializeState(jsonContent: string) {
        try {
            const data = JSON.parse(jsonContent)
            if (data.tables) {
                tables.value = data.tables.map((t: any) => ({
                    ...t,
                    mergedRegions: t.mergedRegions ?? [],
                    rows: (t.rows ?? []).map((row: any[]) =>
                        row.map((cell: any) => {
                            // Ensure cellType exists (migration from older files)
                            if (!cell.cellType) {
                                if (cell.value === null || cell.value === undefined) {
                                    cell.cellType = 'empty'
                                } else if (typeof cell.value === 'boolean') {
                                    cell.cellType = 'boolean'
                                } else if (typeof cell.value === 'number') {
                                    cell.cellType = Number.isInteger(cell.value) ? 'integer' : 'float'
                                } else if (typeof cell.value === 'string') {
                                    // Try to detect the type from string value
                                    const detected = detectType(cell.value)
                                    cell.cellType = detected.type
                                } else {
                                    cell.cellType = 'text'
                                }
                            }
                            return cell
                        })
                    ),
                }))
                maxZ = Math.max(0, ...tables.value.map(t => t.zIndex))
                tableCount = tables.value.length
            }
            if (data.canvasOffset) {
                canvasOffset.value = data.canvasOffset
            }
            activeCell.value = null
            isEditing.value = false
            recalculate()
            return true
        } catch (error) {
            console.error('Failed to load file:', error)
            return false
        }
    }

    async function saveFile(filePath?: string) {
        if (!window.electronAPI) {
            alert('File operations require Electron')
            return false
        }

        let targetPath = filePath || currentFilePath.value

        if (!targetPath) {
            const result = await window.electronAPI.showSaveDialog()
            if (result.canceled || !result.filePath) return false
            targetPath = result.filePath
        }

        const content = serializeState()
        const result = await window.electronAPI.writeFile(targetPath, content)

        if (result.success) {
            currentFilePath.value = targetPath
            return true
        } else {
            alert(`Failed to save file: ${result.error}`)
            return false
        }
    }

    async function saveAsFile() {
        return await saveFile(undefined)
    }

    async function openFile() {
        if (!window.electronAPI) {
            alert('File operations require Electron')
            return false
        }

        const result = await window.electronAPI.showOpenDialog()
        if (result.canceled || result.filePaths.length === 0) return false

        const filePath = result.filePaths[0]
        const readResult = await window.electronAPI.readFile(filePath)

        if (readResult.success && readResult.content) {
            if (deserializeState(readResult.content)) {
                currentFilePath.value = filePath
                return true
            } else {
                alert('Failed to parse file')
                return false
            }
        } else {
            alert(`Failed to open file: ${readResult.error}`)
            return false
        }
    }

    function newFile() {
        tables.value = []
        activeCell.value = null
        isEditing.value = false
        canvasOffset.value = { x: 0, y: 0 }
        currentFilePath.value = null
        maxZ = 0
        tableCount = 0
    }

    return {
        // State
        tables,
        activeCell,
        selectionRange,
        isEditing,
        editValue,
        canvasOffset,
        currentFilePath,

        // Tables
        addTable,
        removeTable,
        bringToFront,
        renameTable,
        moveTable,

        // Rows & Columns
        addRow,
        addColumn,
        deleteRow,
        deleteColumn,
        insertRowAt,
        insertColumnAt,

        // Cell
        getCell,
        setCellValue,
        getDisplayValue,
        getRawValue,
        getCellType,
        getCellAlignment,
        setCellType,
        setCellFormat,
        setSelectionFormat,
        getActiveCellFormat,

        // Selection
        selectCell,
        extendSelection,
        getNormalizedSelection,
        isInSelection,
        hasMultiCellSelection,

        // Merge
        getMergedRegionAt,
        isMergedOrigin,
        isCellHiddenByMerge,
        mergeCells,
        unmergeCells,
        mergeSelection,
        unmergeSelection,
        selectionHasMerge,

        // Editing
        startEditing,
        commitEdit,
        cancelEdit,
        clearActiveCell,
        moveSelection,

        recalculate,
        findTable,

        // File operations
        saveFile,
        saveAsFile,
        openFile,
        newFile,
    }
}

export type SpreadsheetState = ReturnType<typeof useSpreadsheet>
export const SPREADSHEET_KEY = Symbol('spreadsheet') as InjectionKey<SpreadsheetState>
