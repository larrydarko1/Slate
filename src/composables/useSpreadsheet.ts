import { ref, computed, type InjectionKey } from 'vue'
import type { SpreadsheetTable, Cell, CellValue, CellReference, MergedRegion, SelectionRange, Canvas, TextBox, ChartObject } from '../types/spreadsheet'
import { generateId, createDefaultTable, createEmptyCell, createDefaultCanvas, createDefaultTextBox, createDefaultChart, MAX_CANVASES, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, indexToColumnLetter, columnLetterToIndex } from '../types/spreadsheet'
import { evaluateFormulaTyped } from '../engine/formula'
import type { CellDataType } from '../engine/cellTypes'
import { detectType, formatCellDisplay, getTypeAlignment } from '../engine/cellTypes'

export function useSpreadsheet() {
    const canvases = ref<Canvas[]>([createDefaultCanvas('Canvas 1')])
    const activeCanvasId = ref<string>(canvases.value[0].id)

    // ── Undo / Redo ──
    const MAX_UNDO = 100
    const undoStack: string[] = []
    const redoStack: string[] = []
    const canUndo = ref(false)
    const canRedo = ref(false)

    /** Deep-clone canvases state as a JSON string for the undo stack */
    function snapshotState(): string {
        return JSON.stringify(canvases.value)
    }

    /** Restore canvases from a JSON snapshot */
    function restoreState(snapshot: string) {
        canvases.value = JSON.parse(snapshot) as Canvas[]
        // Ensure activeCanvasId still exists
        if (!canvases.value.find(c => c.id === activeCanvasId.value)) {
            activeCanvasId.value = canvases.value[0].id
        }
        recalculate()
    }

    /**
     * Save current state to undo stack before a mutation.
     * Call this at the beginning of any function that modifies data.
     * Nested calls are ignored so compound operations record only one snapshot.
     */
    let undoNesting = 0
    function pushUndo() {
        if (undoNesting > 0) return  // nested mutation — already captured
        undoNesting++
        undoStack.push(snapshotState())
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        // Any new mutation clears the redo stack
        redoStack.length = 0
        canUndo.value = undoStack.length > 0
        canRedo.value = false
        // Reset nesting after microtask so all sync mutations in the same call chain are grouped
        queueMicrotask(() => { undoNesting = 0 })
    }

    /**
     * Push undo only once for the start of a continuous operation (drag/resize).
     * Returns true if it pushed (first call), false on subsequent calls.
     * Call `endUndoBatch()` when the drag/resize ends.
     */
    let undoBatchActive = false
    function startUndoBatch() {
        if (!undoBatchActive) {
            pushUndo()
            undoBatchActive = true
        }
    }
    function endUndoBatch() {
        undoBatchActive = false
    }

    function undo() {
        if (undoStack.length === 0) return
        // Save current state to redo
        redoStack.push(snapshotState())
        const prev = undoStack.pop()!
        restoreState(prev)
        canUndo.value = undoStack.length > 0
        canRedo.value = redoStack.length > 0
    }

    function redo() {
        if (redoStack.length === 0) return
        undoStack.push(snapshotState())
        const next = redoStack.pop()!
        restoreState(next)
        canUndo.value = undoStack.length > 0
        canRedo.value = redoStack.length > 0
    }

    // Computed references that point into the active canvas
    const activeCanvas = computed(() =>
        canvases.value.find(c => c.id === activeCanvasId.value) ?? canvases.value[0]
    )
    const tables = computed(() => activeCanvas.value.tables)
    const textBoxes = computed(() => activeCanvas.value.textBoxes)
    const charts = computed(() => activeCanvas.value.charts)
    const canvasOffset = computed({
        get: () => activeCanvas.value.canvasOffset,
        set: (v) => { activeCanvas.value.canvasOffset = v },
    })
    const canvasZoom = computed({
        get: () => activeCanvas.value.canvasZoom,
        set: (v) => { activeCanvas.value.canvasZoom = v },
    })

    const activeCell = ref<CellReference | null>(null)
    const activeTextBoxId = ref<string | null>(null)
    const activeChartId = ref<string | null>(null)
    const selectionRange = ref<SelectionRange | null>(null)
    const isEditing = ref(false)
    const editValue = ref('')
    const formulaMode = ref(false)

    // ── Chart data selection mode (Apple Numbers style) ──
    /** Which field is being picked: 'labels' | 'series:0' | 'series:1' | ... */
    const chartSelectionMode = ref<string | null>(null)
    /** Whether we're currently in chart data selection mode */
    const chartSelectionActive = computed(() => chartSelectionMode.value !== null)

    // Color palette for chart data references
    const CHART_REF_COLORS = [
        '#3b82f6', // blue
        '#ef4444', // red
        '#22c55e', // green
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#06b6d4', // cyan
        '#f97316', // orange
    ]

    // Color palette for formula references (Apple Numbers style)
    const REF_COLORS = [
        '#3b82f6', // blue
        '#ef4444', // red
        '#22c55e', // green
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#06b6d4', // cyan
        '#f97316', // orange
    ]

    /** Tracked cell references inserted via formula mode */
    interface FormulaRef {
        tableId: string
        col: number
        row: number
        refString: string
        color: string
    }
    const formulaRefs = ref<FormulaRef[]>([])

    let maxZ = 0
    let tableCount = 0
    let canvasCount = 1

    // ── Canvas CRUD ──

    function addCanvas() {
        if (canvases.value.length >= MAX_CANVASES) return
        pushUndo()
        canvasCount++
        const c = createDefaultCanvas(`Canvas ${canvasCount}`)
        canvases.value.push(c)
        switchCanvas(c.id)
    }

    function removeCanvas(canvasId: string) {
        if (canvases.value.length <= 1) return // always keep at least one
        pushUndo()
        const idx = canvases.value.findIndex(c => c.id === canvasId)
        if (idx < 0) return
        canvases.value.splice(idx, 1)
        if (activeCanvasId.value === canvasId) {
            activeCanvasId.value = canvases.value[Math.min(idx, canvases.value.length - 1)].id
        }
        activeCell.value = null
        selectionRange.value = null
        isEditing.value = false
    }

    function renameCanvas(canvasId: string, name: string) {
        pushUndo()
        const c = canvases.value.find(cv => cv.id === canvasId)
        if (!c) return
        const oldName = c.name
        if (oldName === name) return
        c.name = name
        // Rewrite all references that used the old canvas name
        rewriteCanvasNameReferences(oldName, name)
        recalculate()
    }

    function switchCanvas(canvasId: string) {
        // During formula editing, preserve editing state for cross-canvas references
        if (isEditing.value && formulaMode.value) {
            activeCanvasId.value = canvasId
            // Clear selection / non-formula state for the new canvas view
            selectionRange.value = null
            activeTextBoxId.value = null
            activeChartId.value = null
            chartSelectionMode.value = null
            // Recalculate maxZ for the new canvas
            const cv = activeCanvas.value
            maxZ = Math.max(0, ...cv.tables.map(t => t.zIndex), ...cv.textBoxes.map(tb => tb.zIndex), ...cv.charts.map(ch => ch.zIndex))
            return
        }

        if (isEditing.value) commitEdit()
        activeCell.value = null
        activeTextBoxId.value = null
        activeChartId.value = null
        selectionRange.value = null
        isEditing.value = false
        chartSelectionMode.value = null
        activeCanvasId.value = canvasId
        // Recalculate maxZ for the new canvas
        const cv = activeCanvas.value
        maxZ = Math.max(0, ...cv.tables.map(t => t.zIndex), ...cv.textBoxes.map(tb => tb.zIndex), ...cv.charts.map(ch => ch.zIndex))
    }

    // ── Zoom ──

    function setZoom(zoom: number, centerX?: number, centerY?: number) {
        const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) * 100) / 100
        const oldZoom = canvasZoom.value
        if (clamped === oldZoom) return

        // Zoom towards the given center point (default: center of viewport)
        if (centerX !== undefined && centerY !== undefined) {
            // The point under the cursor in canvas-space should stay under the cursor
            const worldX = (centerX - canvasOffset.value.x) / oldZoom
            const worldY = (centerY - canvasOffset.value.y) / oldZoom
            canvasOffset.value = {
                x: centerX - worldX * clamped,
                y: centerY - worldY * clamped,
            }
        }

        canvasZoom.value = clamped
    }

    function zoomIn(centerX?: number, centerY?: number) {
        setZoom(canvasZoom.value + ZOOM_STEP, centerX, centerY)
    }

    function zoomOut(centerX?: number, centerY?: number) {
        setZoom(canvasZoom.value - ZOOM_STEP, centerX, centerY)
    }

    function resetZoom() {
        setZoom(1.0)
    }

    function reorderCanvas(fromIndex: number, toIndex: number) {
        if (fromIndex === toIndex) return
        if (fromIndex < 0 || toIndex < 0) return
        if (fromIndex >= canvases.value.length || toIndex >= canvases.value.length) return
        const [moved] = canvases.value.splice(fromIndex, 1)
        canvases.value.splice(toIndex, 0, moved)
    }

    // ── Table CRUD ──

    function addTable() {
        pushUndo()
        tableCount++
        const offsetIdx = activeCanvas.value.tables.length
        const zoom = canvasZoom.value
        const x = (-canvasOffset.value.x + 80 + offsetIdx * 40) / zoom
        const y = (-canvasOffset.value.y + 60 + offsetIdx * 40) / zoom
        const t = createDefaultTable(x, y, `Table ${tableCount}`)
        t.zIndex = ++maxZ
        activeCanvas.value.tables.push(t)
    }

    function removeTable(tableId: string) {
        pushUndo()
        const canvas = activeCanvas.value
        canvas.tables = canvas.tables.filter(t => t.id !== tableId)
        if (activeCell.value?.tableId === tableId) activeCell.value = null
    }

    function bringToFront(tableId: string) {
        const t = findTable(tableId)
        if (t) t.zIndex = ++maxZ
    }

    function bringToFrontById(id: string) {
        // Works for any item (table, textbox, or chart)
        const t = findTable(id)
        if (t) { t.zIndex = ++maxZ; return }
        const tb = findTextBox(id)
        if (tb) { tb.zIndex = ++maxZ; return }
        const ch = findChart(id)
        if (ch) ch.zIndex = ++maxZ
    }

    function renameTable(tableId: string, name: string) {
        pushUndo()
        const t = findTable(tableId)
        if (!t) return
        const oldName = t.name
        if (oldName === name) return
        t.name = name
        // Rewrite all references that used the old table name
        rewriteTableNameReferences(oldName, name)
        recalculate()
    }

    function moveTable(tableId: string, x: number, y: number) {
        startUndoBatch()
        const t = findTable(tableId)
        if (t) { t.x = x; t.y = y }
    }

    // ── Row / Column operations ──

    function addRow(tableId: string) {
        pushUndo()
        const t = findTable(tableId)
        if (!t) return
        t.rows.push(t.columns.map(() => createEmptyCell()))
    }

    function addColumn(tableId: string) {
        pushUndo()
        const t = findTable(tableId)
        if (!t) return
        t.columns.push({ id: generateId('col'), width: 120 })
        for (const row of t.rows) row.push(createEmptyCell())
    }

    /** Check if a specific row is completely empty (no values, no formulas) */
    function isRowEmpty(tableId: string, rowIdx: number): boolean {
        const t = findTable(tableId)
        if (!t || rowIdx < 0 || rowIdx >= t.rows.length) return false
        return t.rows[rowIdx].every(cell => cell.value === null && !cell.formula)
    }

    /** Check if a specific column is completely empty (no values, no formulas) */
    function isColumnEmpty(tableId: string, colIdx: number): boolean {
        const t = findTable(tableId)
        if (!t || colIdx < 0 || colIdx >= t.columns.length) return false
        return t.rows.every(row => {
            const cell = row[colIdx]
            return cell.value === null && !cell.formula
        })
    }

    /** Remove the last row if it is completely empty and there is more than 1 row. Returns true if removed. */
    function removeLastRowIfEmpty(tableId: string): boolean {
        const t = findTable(tableId)
        if (!t || t.rows.length <= 1) return false
        const lastIdx = t.rows.length - 1
        if (!isRowEmpty(tableId, lastIdx)) return false
        // Check merges involving the last row
        const hasMerge = t.mergedRegions.some(m => lastIdx >= m.startRow && lastIdx <= m.endRow)
        if (hasMerge) return false
        t.rows.splice(lastIdx, 1)
        if (activeCell.value?.tableId === tableId && activeCell.value.row >= t.rows.length) {
            activeCell.value.row = t.rows.length - 1
        }
        return true
    }

    /** Remove the last column if it is completely empty and there is more than 1 column. Returns true if removed. */
    function removeLastColumnIfEmpty(tableId: string): boolean {
        const t = findTable(tableId)
        if (!t || t.columns.length <= 1) return false
        const lastIdx = t.columns.length - 1
        if (!isColumnEmpty(tableId, lastIdx)) return false
        // Check merges involving the last column
        const hasMerge = t.mergedRegions.some(m => lastIdx >= m.startCol && lastIdx <= m.endCol)
        if (hasMerge) return false
        t.columns.splice(lastIdx, 1)
        for (const row of t.rows) row.splice(lastIdx, 1)
        if (activeCell.value?.tableId === tableId && activeCell.value.col >= t.columns.length) {
            activeCell.value.col = t.columns.length - 1
        }
        return true
    }

    function deleteRow(tableId: string, rowIdx: number) {
        const t = findTable(tableId)
        if (!t || t.rows.length <= 1) return
        pushUndo()
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
        pushUndo()
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
        pushUndo()
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
        pushUndo()
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

    /** Move a row from one index to another, updating merged regions. */
    function reorderRow(tableId: string, fromIdx: number, toIdx: number) {
        reorderRows(tableId, fromIdx, fromIdx, toIdx)
    }

    /**
     * Move a contiguous block of rows [fromStart..fromEnd] so that the block
     * ends up starting at position toIdx.  toIdx is expressed in the *original*
     * index space (before the move).
     */
    function reorderRows(tableId: string, fromStart: number, fromEnd: number, toIdx: number) {
        const t = findTable(tableId)
        if (!t) return
        const count = fromEnd - fromStart + 1
        // Nothing to do if dropping inside the source range
        if (toIdx >= fromStart && toIdx <= fromEnd) return
        if (fromStart < 0 || fromEnd >= t.rows.length) return
        if (toIdx < 0 || toIdx >= t.rows.length) return
        pushUndo()
        // Extract the block
        const movedRows = t.rows.splice(fromStart, count)
        // After removal, compute the adjusted insertion index
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx
        t.rows.splice(insertAt, 0, ...movedRows)
        // Remap merged region row indices
        t.mergedRegions = t.mergedRegions.map(m => {
            let sr = remapRowIdx(m.startRow, fromStart, fromEnd, insertAt)
            let er = remapRowIdx(m.endRow, fromStart, fromEnd, insertAt)
            if (sr > er) { const tmp = sr; sr = er; er = tmp }
            return { ...m, startRow: sr, endRow: er }
        })
        // Update active cell
        if (activeCell.value?.tableId === tableId) {
            activeCell.value.row = remapRowIdx(activeCell.value.row, fromStart, fromEnd, insertAt)
        }
        // Update selection to follow the moved block
        if (selectionRange.value?.tableId === tableId) {
            const sr = selectionRange.value
            sr.startRow = insertAt
            sr.endRow = insertAt + count - 1
        }
        // Remap formula cell-references so they still point at the same data
        const rowMapper = (idx: number) => remapRowIdx(idx, fromStart, fromEnd, insertAt)
        remapAllFormulasInTable(t, null, rowMapper)
        recalculate()
    }

    /** Helper: remap an index after moving block [fromStart..fromEnd] to insertAt */
    function remapRowIdx(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1
        if (idx >= fromStart && idx <= fromEnd) {
            // Part of the moved block
            return insertAt + (idx - fromStart)
        }
        // Not part of the moved block — figure out displacement
        if (fromStart < insertAt) {
            // Block moved down: indices between fromEnd+1..insertAt+count-1 shift up by count
            if (idx > fromEnd && idx < insertAt + count) return idx - count
        } else {
            // Block moved up: indices between insertAt..fromStart-1 shift down by count
            if (idx >= insertAt && idx < fromStart) return idx + count
        }
        return idx
    }

    /** Move a column from one index to another, updating merged regions. */
    function reorderColumn(tableId: string, fromIdx: number, toIdx: number) {
        reorderColumns(tableId, fromIdx, fromIdx, toIdx)
    }

    /**
     * Move a contiguous block of columns [fromStart..fromEnd] so that the block
     * ends up starting at position toIdx.  toIdx is expressed in the *original*
     * index space (before the move).
     */
    function reorderColumns(tableId: string, fromStart: number, fromEnd: number, toIdx: number) {
        const t = findTable(tableId)
        if (!t) return
        const count = fromEnd - fromStart + 1
        if (toIdx >= fromStart && toIdx <= fromEnd) return
        if (fromStart < 0 || fromEnd >= t.columns.length) return
        if (toIdx < 0 || toIdx >= t.columns.length) return
        pushUndo()
        // Extract the column definitions
        const movedCols = t.columns.splice(fromStart, count)
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx
        t.columns.splice(insertAt, 0, ...movedCols)
        // Move cell data in each row
        for (const row of t.rows) {
            const movedCells = row.splice(fromStart, count)
            row.splice(insertAt, 0, ...movedCells)
        }
        // Remap merged region col indices
        t.mergedRegions = t.mergedRegions.map(m => {
            let sc = remapColIdx(m.startCol, fromStart, fromEnd, insertAt)
            let ec = remapColIdx(m.endCol, fromStart, fromEnd, insertAt)
            if (sc > ec) { const tmp = sc; sc = ec; ec = tmp }
            return { ...m, startCol: sc, endCol: ec }
        })
        // Update active cell
        if (activeCell.value?.tableId === tableId) {
            activeCell.value.col = remapColIdx(activeCell.value.col, fromStart, fromEnd, insertAt)
        }
        // Update selection to follow the moved block
        if (selectionRange.value?.tableId === tableId) {
            const sr = selectionRange.value
            sr.startCol = insertAt
            sr.endCol = insertAt + count - 1
        }
        // Remap formula cell-references so they still point at the same data
        const colMapper = (idx: number) => remapColIdx(idx, fromStart, fromEnd, insertAt)
        remapAllFormulasInTable(t, colMapper, null)
        recalculate()
    }

    /** Helper: remap a column index after moving block [fromStart..fromEnd] to insertAt */
    function remapColIdx(idx: number, fromStart: number, fromEnd: number, insertAt: number): number {
        const count = fromEnd - fromStart + 1
        if (idx >= fromStart && idx <= fromEnd) {
            return insertAt + (idx - fromStart)
        }
        if (fromStart < insertAt) {
            if (idx > fromEnd && idx < insertAt + count) return idx - count
        } else {
            if (idx >= insertAt && idx < fromStart) return idx + count
        }
        return idx
    }

    /**
     * Delete all rows covered by the current selection.
     * Rows are removed from bottom to top so indices stay valid.
     */
    function deleteSelectedRows() {
        const sr = getNormalizedSelection()
        if (!sr) return
        const t = findTable(sr.tableId)
        if (!t) return
        // Only act when full rows are selected (startCol=0, endCol=last)
        if (sr.startCol !== 0 || sr.endCol !== t.columns.length - 1) return
        const count = sr.endRow - sr.startRow + 1
        // Don't delete all rows
        if (count >= t.rows.length) return
        pushUndo()
        // Delete from bottom to top
        for (let r = sr.endRow; r >= sr.startRow; r--) {
            deleteRow(sr.tableId, r)
        }
        // Adjust active cell
        if (activeCell.value && activeCell.value.tableId === sr.tableId) {
            activeCell.value.row = Math.min(sr.startRow, t.rows.length - 1)
            activeCell.value.col = 0
        }
        selectionRange.value = null
    }

    /**
     * Delete all columns covered by the current selection.
     * Columns are removed from right to left so indices stay valid.
     */
    function deleteSelectedColumns() {
        const sr = getNormalizedSelection()
        if (!sr) return
        const t = findTable(sr.tableId)
        if (!t) return
        // Only act when full columns are selected (startRow=0, endRow=last)
        if (sr.startRow !== 0 || sr.endRow !== t.rows.length - 1) return
        const count = sr.endCol - sr.startCol + 1
        // Don't delete all columns
        if (count >= t.columns.length) return
        pushUndo()
        // Delete from right to left
        for (let c = sr.endCol; c >= sr.startCol; c--) {
            deleteColumn(sr.tableId, c)
        }
        // Adjust active cell
        if (activeCell.value && activeCell.value.tableId === sr.tableId) {
            activeCell.value.col = Math.min(sr.startCol, t.columns.length - 1)
            activeCell.value.row = 0
        }
        selectionRange.value = null
    }

    // ── Cell access ──

    function getCell(tableId: string, col: number, row: number): Cell | null {
        const t = findTable(tableId)
        if (!t || row < 0 || row >= t.rows.length || col < 0 || col >= t.columns.length) return null
        return t.rows[row][col]
    }

    function setCellValue(tableId: string, col: number, row: number, raw: string) {
        pushUndo()
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
        const dp = cell.format?.decimalPlaces

        if (v === null || v === undefined) return ''

        // Error strings pass through
        if (typeof v === 'string' && v.startsWith('#')) return v

        return formatCellDisplay(v, t, dp)
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
        pushUndo()

        cell.cellType = newType

        // For formula cells, override the auto-detected computed type
        if (cell.formula != null) {
            cell.computedType = newType
        }

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
        pushUndo()
        const cell = getCell(tableId, col, row)
        if (!cell) return
        cell.format = { ...cell.format, ...fmt }
    }

    /** Apply format to all cells in the current selection */
    function setSelectionFormat(fmt: Partial<import('../types/spreadsheet').CellFormat>) {
        const sr = getNormalizedSelection()
        if (!sr) return
        pushUndo()
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
        activeTextBoxId.value = null
        activeChartId.value = null
        selectionRange.value = { tableId, startCol: col, startRow: row, endCol: col, endRow: row }
        bringToFront(tableId)
    }

    function selectRow(tableId: string, row: number) {
        const t = findTable(tableId)
        if (!t) return
        if (isEditing.value) commitEdit()
        activeCell.value = { tableId, col: 0, row }
        activeTextBoxId.value = null
        activeChartId.value = null
        selectionRange.value = { tableId, startCol: 0, startRow: row, endCol: t.columns.length - 1, endRow: row }
        bringToFront(tableId)
    }

    function selectColumn(tableId: string, col: number) {
        const t = findTable(tableId)
        if (!t) return
        if (isEditing.value) commitEdit()
        activeCell.value = { tableId, col, row: 0 }
        activeTextBoxId.value = null
        activeChartId.value = null
        selectionRange.value = { tableId, startCol: col, startRow: 0, endCol: col, endRow: t.rows.length - 1 }
        bringToFront(tableId)
    }

    function extendRowSelection(tableId: string, row: number) {
        if (!activeCell.value || activeCell.value.tableId !== tableId) return
        const t = findTable(tableId)
        if (!t) return
        if (isEditing.value) commitEdit()
        const sr = selectionRange.value!
        selectionRange.value = {
            tableId,
            startCol: 0,
            startRow: sr.startRow,
            endCol: t.columns.length - 1,
            endRow: row,
        }
    }

    function extendColumnSelection(tableId: string, col: number) {
        if (!activeCell.value || activeCell.value.tableId !== tableId) return
        const t = findTable(tableId)
        if (!t) return
        if (isEditing.value) commitEdit()
        const sr = selectionRange.value!
        selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: 0,
            endCol: col,
            endRow: t.rows.length - 1,
        }
    }

    function selectAll(tableId: string) {
        const t = findTable(tableId)
        if (!t) return
        if (isEditing.value) commitEdit()
        activeCell.value = { tableId, col: 0, row: 0 }
        selectionRange.value = { tableId, startCol: 0, startRow: 0, endCol: t.columns.length - 1, endRow: t.rows.length - 1 }
        bringToFront(tableId)
    }

    function isRowInSelection(tableId: string, row: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        // Row is "in selection" if the selection spans all columns for this row
        return row >= sr.startRow && row <= sr.endRow && sr.startCol === 0 && sr.endCol === t.columns.length - 1
    }

    function isColInSelection(tableId: string, col: number): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        // Col is "in selection" if the selection spans all rows for this col
        return col >= sr.startCol && col <= sr.endCol && sr.startRow === 0 && sr.endRow === t.rows.length - 1
    }

    function isEntireTableSelected(tableId: string): boolean {
        const sr = getNormalizedSelection()
        if (!sr || sr.tableId !== tableId) return false
        const t = findTable(tableId)
        if (!t) return false
        return sr.startCol === 0 && sr.startRow === 0 && sr.endCol === t.columns.length - 1 && sr.endRow === t.rows.length - 1
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

        // Determine if the formula cell lives on a different canvas
        const formulaCellInfo = findTableGlobal(tableId)
        const needSwitchBack = formulaCellInfo && formulaCellInfo.canvas.id !== activeCanvasId.value

        setCellValue(tableId, col, row, editValue.value)
        isEditing.value = false
        formulaMode.value = false
        formulaRefs.value = []

        // Switch back to the formula cell's canvas so the user sees the result
        if (needSwitchBack && formulaCellInfo) {
            activeCanvasId.value = formulaCellInfo.canvas.id
            const cv = activeCanvas.value
            maxZ = Math.max(0, ...cv.tables.map(t => t.zIndex), ...cv.textBoxes.map(tb => tb.zIndex), ...cv.charts.map(ch => ch.zIndex))
        }
    }

    function cancelEdit() {
        // If canceling during cross-canvas formula editing, switch back
        if (activeCell.value && formulaMode.value) {
            const formulaCellInfo = findTableGlobal(activeCell.value.tableId)
            if (formulaCellInfo && formulaCellInfo.canvas.id !== activeCanvasId.value) {
                activeCanvasId.value = formulaCellInfo.canvas.id
                const cv = activeCanvas.value
                maxZ = Math.max(0, ...cv.tables.map(t => t.zIndex), ...cv.textBoxes.map(tb => tb.zIndex), ...cv.charts.map(ch => ch.zIndex))
            }
        }
        isEditing.value = false
        editValue.value = ''
        formulaMode.value = false
        formulaRefs.value = []
    }

    function clearActiveCell() {
        if (!activeCell.value) return
        pushUndo()
        // If there's a multi-cell selection, clear all selected cells
        const sr = getNormalizedSelection()
        if (sr && (sr.startCol !== sr.endCol || sr.startRow !== sr.endRow)) {
            for (let r = sr.startRow; r <= sr.endRow; r++) {
                for (let c = sr.startCol; c <= sr.endCol; c++) {
                    setCellValue(sr.tableId, c, r, '')
                }
            }
        } else {
            const { tableId, col, row } = activeCell.value
            setCellValue(tableId, col, row, '')
        }
    }

    // ── Formula point-to-insert mode ──

    /**
     * Build a reference string for a cell, relative to the formula's source cell.
     * - Same table: A1
     * - Different table, same canvas: 'Table 2'::A1
     * - Different canvas: 'Canvas 2'::'Table 1'::A1
     */
    function buildCellReferenceString(targetTableId: string, col: number, row: number): string {
        if (!activeCell.value) return ''
        const colLetter = indexToColumnLetter(col)
        const rowNum = row + 1
        const cellRef = `${colLetter}${rowNum}`

        // Same table → plain ref
        if (targetTableId === activeCell.value.tableId) {
            return cellRef
        }

        // Find target table's name and canvas
        const targetInfo = findTableGlobal(targetTableId)
        if (!targetInfo) return cellRef

        const sourceInfo = findTableGlobal(activeCell.value.tableId)
        const targetTableName = targetInfo.table.name
        const quoteTable = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`

        // Same canvas → table-qualified ref
        if (sourceInfo && sourceInfo.canvas.id === targetInfo.canvas.id) {
            return `${quoteTable(targetTableName)}::${cellRef}`
        }

        // Different canvas → canvas + table qualified ref
        const targetCanvasName = targetInfo.canvas.name
        const quoteCanvas = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`
        return `${quoteCanvas(targetCanvasName)}::${quoteTable(targetTableName)}::${cellRef}`
    }

    /**
     * Insert a cell reference into the current formula being edited.
     * Called when clicking a cell while in formula mode.
     * Appends cell refs with '+' as the default operator, so clicking
     * multiple cells builds expressions like "=A1+B2+C3".
     * The user can type operators (+, -, *, /, parentheses) in the formula
     * bar between clicks to build complex formulas like "=(A1+B2)*(C3)/A1".
     */
    function insertCellReference(tableId: string, col: number, row: number) {
        if (!isEditing.value || !formulaMode.value) return

        const refStr = buildCellReferenceString(tableId, col, row)
        if (!refStr) return

        // Assign a color to this reference
        const color = REF_COLORS[formulaRefs.value.length % REF_COLORS.length]
        formulaRefs.value.push({ tableId, col, row, refString: refStr, color })

        let current = editValue.value
        // If empty or just '=', start the formula
        if (!current || current === '=') {
            editValue.value = '=' + refStr
            return
        }

        // Look at the last non-whitespace character to decide if we need an operator
        const trimmed = current.trimEnd()
        const lastChar = trimmed[trimmed.length - 1]

        // If the last char is an operator or opening paren, just append the ref
        if (lastChar && '+-*/^(,'.includes(lastChar)) {
            editValue.value = current + refStr
        } else {
            // Auto-insert '+' between consecutive references / values
            editValue.value = current + '+' + refStr
        }
    }

    /** Token returned by getFormulaTokens – may be a single cell or a range */
    interface FormulaToken {
        text: string
        isRef: boolean
        color?: string
        tableId?: string
        col?: number
        row?: number
        /** If the reference is a range (A1:C5), these hold the end coordinates */
        endCol?: number
        endRow?: number
        isRange?: boolean
    }

    /**
     * Parse a formula string to extract cell references and assign colors.
     * If no explicit formula is provided, uses the current editValue.
     * Supports single-cell refs (A1), ranges (A1:C5), cross-table and cross-canvas refs.
     */
    function getFormulaTokens(formulaOverride?: string): FormulaToken[] {
        const val = formulaOverride ?? editValue.value
        if (!val.startsWith('=')) return [{ text: val, isRef: false }]

        const body = val.substring(1) // strip '='
        const tokens: FormulaToken[] = []
        // Match cell references: optional 'Name':: prefix(es) and A1-style ref, with optional :A1 range suffix
        // Pattern: (('...'|\w+)::)* [A-Z]+[0-9]+ (:[A-Z]+[0-9]+)?
        const refRegex = /(?:(?:'[^']*'|\w+)::)*(?:(?:'[^']*'|\w+)::)?[A-Z]+\d+(?::[A-Z]+\d+)?/g
        let lastIndex = 0
        let colorIdx = 0
        let match: RegExpExecArray | null

        while ((match = refRegex.exec(body)) !== null) {
            // Text before this ref
            if (match.index > lastIndex) {
                tokens.push({ text: body.substring(lastIndex, match.index), isRef: false })
            }
            const refText = match[0]
            // Try to resolve which cell / range this ref points to
            const resolved = resolveRefString(refText)
            const color = REF_COLORS[colorIdx % REF_COLORS.length]
            tokens.push({
                text: refText,
                isRef: true,
                color,
                tableId: resolved?.tableId,
                col: resolved?.col,
                row: resolved?.row,
                endCol: resolved?.endCol,
                endRow: resolved?.endRow,
                isRange: resolved?.isRange,
            })
            colorIdx++
            lastIndex = match.index + match[0].length
        }
        if (lastIndex < body.length) {
            tokens.push({ text: body.substring(lastIndex), isRef: false })
        }
        return tokens
    }

    /** Resolve a reference string like 'Table 1'::A1, A1:C5, or 'Canvas'::'Table'::A1:B3 */
    function resolveRefString(refText: string): { tableId: string; col: number; row: number; endCol?: number; endRow?: number; isRange?: boolean } | null {
        if (!activeCell.value) return null

        // Split on :: to separate qualifiers from the cell ref part
        const parts = refText.split('::')
        const cellPart = parts[parts.length - 1]

        // Try range first: A1:C5
        const rangeMatch = cellPart.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
        // Single cell: A1
        const singleMatch = !rangeMatch ? cellPart.match(/^([A-Z]+)(\d+)$/) : null

        if (!rangeMatch && !singleMatch) return null

        const col = columnLetterToIndex(rangeMatch ? rangeMatch[1] : singleMatch![1])
        const row = parseInt(rangeMatch ? rangeMatch[2] : singleMatch![2]) - 1
        const endCol = rangeMatch ? columnLetterToIndex(rangeMatch[3]) : undefined
        const endRow = rangeMatch ? parseInt(rangeMatch[4]) - 1 : undefined
        const isRange = !!rangeMatch

        const buildResult = (tableId: string) => ({ tableId, col, row, endCol, endRow, isRange })

        if (parts.length === 1) {
            // Same table
            return buildResult(activeCell.value.tableId)
        }

        const unquote = (s: string) => s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s

        if (parts.length === 2) {
            // table::ref
            const tableName = unquote(parts[0])
            const t = findTableByName(tableName)
            if (!t) return null
            return buildResult(t.id)
        }

        if (parts.length === 3) {
            // canvas::table::ref
            const canvasName = unquote(parts[0])
            const tableName = unquote(parts[1])
            const t = findTableByName(tableName, canvasName)
            if (!t) return null
            return buildResult(t.id)
        }

        return null
    }

    /**
     * Get all cells currently referenced in the formula, with their assigned colors.
     * Used by the table component to draw colored outlines.
     *
     * Works in two modes:
     *  1. During editing: parses the editValue formula
     *  2. When a formula cell is selected (not editing): parses the cell's stored formula
     *
     * Ranges (e.g. A1:C5) are expanded into individual cell highlights.
     */
    function getFormulaHighlights(): Array<{ tableId: string; col: number; row: number; color: string }> {
        let tokens: FormulaToken[]

        if (isEditing.value && editValue.value.startsWith('=')) {
            // Mode 1: currently editing a formula
            tokens = getFormulaTokens()
        } else if (!isEditing.value && activeCell.value) {
            // Mode 2: a formula cell is selected (not editing)
            const cell = getCell(activeCell.value.tableId, activeCell.value.col, activeCell.value.row)
            if (!cell?.formula) return []
            tokens = getFormulaTokens('=' + cell.formula)
        } else {
            return []
        }

        const highlights: Array<{ tableId: string; col: number; row: number; color: string }> = []
        for (const t of tokens) {
            if (!t.isRef || t.tableId == null || t.col == null || t.row == null) continue
            const color = t.color!
            if (t.isRange && t.endCol != null && t.endRow != null) {
                // Expand range into individual cells
                const minC = Math.min(t.col, t.endCol)
                const maxC = Math.max(t.col, t.endCol)
                const minR = Math.min(t.row, t.endRow)
                const maxR = Math.max(t.row, t.endRow)
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        highlights.push({ tableId: t.tableId!, col: c, row: r, color })
                    }
                }
            } else {
                highlights.push({ tableId: t.tableId!, col: t.col, row: t.row, color })
            }
        }
        return highlights
    }

    /** Toggle formula mode on/off */
    function toggleFormulaMode() {
        if (!activeCell.value) return
        formulaMode.value = !formulaMode.value
        if (formulaMode.value && !isEditing.value) {
            startEditing('=')
        }
        if (!formulaMode.value) {
            formulaRefs.value = []
        }
    }

    // ── Cell Notes ──

    function setCellNote(tableId: string, col: number, row: number, note: string) {
        pushUndo()
        const cell = getCell(tableId, col, row)
        if (!cell) return
        cell.note = note || undefined
    }

    function getCellNote(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        return cell?.note ?? ''
    }

    function removeCellNote(tableId: string, col: number, row: number) {
        pushUndo()
        const cell = getCell(tableId, col, row)
        if (cell) cell.note = undefined
    }

    function cellHasNote(tableId: string, col: number, row: number): boolean {
        const cell = getCell(tableId, col, row)
        return !!(cell?.note)
    }

    // ── Formula reference remapping (for reorder) ──

    /**
     * Remap local cell references in a formula using arbitrary index mapping functions.
     * Cross-table references (after '::') are left untouched (absolute, like Apple Numbers).
     * Used by reorderRows / reorderColumns to keep formulas pointing at the same data.
     */
    function remapFormulaReferences(
        formula: string,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ): string {
        let result = ''
        let i = 0
        while (i < formula.length) {
            // Skip quoted strings
            if (formula[i] === '"') {
                let j = i + 1
                while (j < formula.length && formula[j] !== '"') j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            // Skip quoted names (single quotes for table/canvas names)
            if (formula[i] === "'") {
                let j = i + 1
                while (j < formula.length && formula[j] !== "'") j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            // Cross-table ref — don't remap
            const endsWithDoubleColon = result.length >= 2 && result.slice(-2) === '::'
            const rest = formula.substring(i)
            const cellRefMatch = rest.match(/^([A-Za-z]+)(\d+)/)
            if (cellRefMatch) {
                const letters = cellRefMatch[1].toUpperCase()
                const digits = cellRefMatch[2]
                const afterRef = formula.substring(i + cellRefMatch[0].length)
                const isFunction = /^\s*\(/.test(afterRef)
                const keywords = ['TRUE', 'FALSE', 'IF', 'AND', 'OR', 'NOT', 'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'ROUND', 'ABS', 'SQRT', 'POWER', 'MOD', 'INT', 'CONCAT', 'UPPER', 'LOWER', 'LEN', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'PI', 'NOW', 'TODAY', 'SUMIF', 'COUNTIF', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH']
                if (isFunction || keywords.includes(letters) || endsWithDoubleColon) {
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                const oldCol = columnLetterToIndex(letters)
                const oldRow = parseInt(digits) - 1
                const newCol = colMapper ? colMapper(oldCol) : oldCol
                const newRow = rowMapper ? rowMapper(oldRow) : oldRow
                result += indexToColumnLetter(newCol) + (newRow + 1)
                i += cellRefMatch[0].length
                continue
            }
            result += formula[i]
            i++
        }
        return result
    }

    /**
     * Walk every cell in the given table and remap local formula references
     * using the provided col/row mapping functions.
     */
    function remapAllFormulasInTable(
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) {
        for (const row of t.rows) {
            for (const cell of row) {
                if (cell.formula) {
                    cell.formula = remapFormulaReferences(cell.formula, colMapper, rowMapper)
                }
            }
        }
    }

    // ── Formula reference shifting (for fill & paste) ──

    /**
     * Shift all cell references in a formula string by the given column and row deltas.
     * Handles simple refs (A1), ranges (A1:B5), cross-table ('Table 1'::A1), and
     * cross-canvas refs.  References that would shift to negative indices are clamped to 0.
     * Only same-table (local) references are shifted; cross-table refs keep their cell
     * positions unchanged (matching Apple Numbers behavior — external refs are absolute).
     */
    function shiftFormulaReferences(formula: string, colDelta: number, rowDelta: number): string {
        // Match cell references like A1, AB23, etc. We need to be careful not to match
        // inside quoted names. Process the formula character by character.
        let result = ''
        let i = 0
        while (i < formula.length) {
            // Skip quoted strings
            if (formula[i] === '"') {
                let j = i + 1
                while (j < formula.length && formula[j] !== '"') j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            // Skip quoted names (single quotes for table/canvas names)
            if (formula[i] === "'") {
                let j = i + 1
                while (j < formula.length && formula[j] !== "'") j++
                result += formula.substring(i, j + 1)
                i = j + 1
                continue
            }
            // Check if we're right after a '::' — that means we're in a cross-table ref.
            // Cross-table cell refs should NOT be shifted (they're absolute in Numbers).
            const beforeStr = result
            const endsWithDoubleColon = beforeStr.length >= 2 && beforeStr.slice(-2) === '::'
            // Try to match a cell reference at position i
            const rest = formula.substring(i)
            const cellRefMatch = rest.match(/^([A-Za-z]+)(\d+)/)
            if (cellRefMatch) {
                const letters = cellRefMatch[1].toUpperCase()
                const digits = cellRefMatch[2]
                // Make sure it's not a function name (functions are followed by '(')
                const afterRef = formula.substring(i + cellRefMatch[0].length)
                const isFunction = /^\s*\(/.test(afterRef)
                // Known keywords that aren't cell refs
                const keywords = ['TRUE', 'FALSE', 'IF', 'AND', 'OR', 'NOT', 'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'ROUND', 'ABS', 'SQRT', 'POWER', 'MOD', 'INT', 'CONCAT', 'UPPER', 'LOWER', 'LEN', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'PI', 'NOW', 'TODAY', 'SUMIF', 'COUNTIF', 'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH']
                if (isFunction || keywords.includes(letters)) {
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                if (endsWithDoubleColon) {
                    // Cross-table ref — don't shift
                    result += cellRefMatch[0]
                    i += cellRefMatch[0].length
                    continue
                }
                // Shift the reference
                const oldCol = columnLetterToIndex(letters)
                const oldRow = parseInt(digits) - 1
                const newCol = Math.max(0, oldCol + colDelta)
                const newRow = Math.max(0, oldRow + rowDelta)
                result += indexToColumnLetter(newCol) + (newRow + 1)
                i += cellRefMatch[0].length
                continue
            }
            result += formula[i]
            i++
        }
        return result
    }

    /**
     * Fill cells from a source range into a target range, tiling the source pattern
     * and shifting formula references relative to each destination cell's offset
     * from the corresponding source cell.
     */
    function fillCells(tableId: string, source: SelectionRange, target: SelectionRange) {
        const t = findTable(tableId)
        if (!t) return
        pushUndo()

        const srcRows = source.endRow - source.startRow + 1
        const srcCols = source.endCol - source.startCol + 1

        // Expand table if necessary
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
                // Skip cells that are inside the source range
                if (r >= source.startRow && r <= source.endRow && c >= source.startCol && c <= source.endCol) continue
                // Map to the corresponding source cell (tiling)
                const srcR = source.startRow + ((r - target.startRow) % srcRows)
                const srcC = source.startCol + ((c - target.startCol) % srcCols)
                const srcCell = getCell(tableId, srcC, srcR)
                if (!srcCell) continue

                const colDelta = c - srcC
                const rowDelta = r - srcR

                if (srcCell.formula) {
                    const shifted = shiftFormulaReferences(srcCell.formula, colDelta, rowDelta)
                    setCellValue(tableId, c, r, '=' + shifted)
                } else {
                    const raw = getRawValue(tableId, srcC, srcR)
                    setCellValue(tableId, c, r, raw)
                }
                if (srcCell.format) {
                    setCellFormat(tableId, c, r, { ...srcCell.format })
                }
            }
        }
        recalculate()
    }

    // ── Clipboard (Copy / Cut / Paste) ──

    interface ClipboardCell {
        raw: string            // Raw value string (or "=formula")
        format?: import('../types/spreadsheet').CellFormat
    }

    /** Internal clipboard buffer: 2-D grid [row][col] */
    let clipboardData: ClipboardCell[][] | null = null
    let clipboardIsCut = false
    let clipboardSource: SelectionRange | null = null

    /**
     * Collect cell data from the current selection into the internal
     * clipboard buffer and write a TSV string to the system clipboard.
     */
    async function copyCells(cut = false) {
        const sr = getNormalizedSelection()
        if (!sr) return

        const rows: ClipboardCell[][] = []
        const tsvRows: string[] = []

        for (let r = sr.startRow; r <= sr.endRow; r++) {
            const rowCells: ClipboardCell[] = []
            const tsvCols: string[] = []
            for (let c = sr.startCol; c <= sr.endCol; c++) {
                const raw = getRawValue(sr.tableId, c, r)
                const cell = getCell(sr.tableId, c, r)
                rowCells.push({
                    raw,
                    format: cell?.format ? { ...cell.format } : undefined,
                })
                // For the system clipboard use the display value so other apps
                // get nicely-formatted text.
                tsvCols.push(getDisplayValue(sr.tableId, c, r))
            }
            rows.push(rowCells)
            tsvRows.push(tsvCols.join('\t'))
        }

        clipboardData = rows
        clipboardIsCut = cut
        clipboardSource = { ...sr }

        // Write to system clipboard (best-effort; may be blocked by browser)
        try {
            await navigator.clipboard.writeText(tsvRows.join('\n'))
        } catch { /* ignore – internal clipboard still works */ }
    }

    async function cutCells() {
        await copyCells(true)
    }

    /**
     * Paste clipboard data starting at the active cell.
     * Prefers the internal buffer; falls back to parsing the system clipboard.
     */
    async function pasteCells() {
        if (!activeCell.value) return
        pushUndo()
        const { tableId, col: startCol, row: startRow } = activeCell.value
        const t = findTable(tableId)
        if (!t) return

        let data = clipboardData

        // If no internal data, try reading from system clipboard
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

        // Write cells — shift formula references relative to paste position
        const srcStartCol = clipboardSource?.startCol ?? 0
        const srcStartRow = clipboardSource?.startRow ?? 0
        for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
                const entry = data[r][c]
                let raw = entry.raw
                // Shift formula references when pasting
                if (raw.startsWith('=') && clipboardSource) {
                    const colDelta = (startCol + c) - (srcStartCol + c)
                    const rowDelta = (startRow + r) - (srcStartRow + r)
                    if (colDelta !== 0 || rowDelta !== 0) {
                        raw = '=' + shiftFormulaReferences(raw.substring(1), colDelta, rowDelta)
                    }
                }
                setCellValue(tableId, startCol + c, startRow + r, raw)
                if (entry.format) {
                    setCellFormat(tableId, startCol + c, startRow + r, entry.format)
                }
            }
        }

        // If it was a cut, clear the source cells
        if (clipboardIsCut && clipboardSource) {
            const src = clipboardSource
            for (let r = src.startRow; r <= src.endRow; r++) {
                for (let c = src.startCol; c <= src.endCol; c++) {
                    // Don't clear if pasting over the same position
                    const destRow = startRow + (r - src.startRow)
                    const destCol = startCol + (c - src.startCol)
                    if (src.tableId === tableId && c === destCol && r === destRow) continue
                    setCellValue(src.tableId, c, r, '')
                }
            }
            clipboardIsCut = false
            clipboardSource = null
        }

        // Select the pasted region
        selectionRange.value = {
            tableId,
            startCol,
            startRow,
            endCol: startCol + Math.max(...data.map(r => r.length)) - 1,
            endRow: startRow + data.length - 1,
        }

        recalculate()
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
        pushUndo()
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
        pushUndo()
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

        /** Get a cell from any table across all canvases */
        function getCellGlobal(tableId: string, col: number, row: number): Cell | null {
            const found = findTableGlobal(tableId)
            if (!found) return null
            const t = found.table
            if (row < 0 || row >= t.rows.length || col < 0 || col >= t.columns.length) return null
            return t.rows[row][col]
        }

        function resolveCellValue(tableId: string, col: number, row: number): CellValue {
            const key = `${tableId}:${col}:${row}`
            if (evaluating.has(key)) return '#CIRCULAR!'

            const cell = getCellGlobal(tableId, col, row)
            if (!cell) return null

            if (cell.formula != null) {
                evaluating.add(key)
                try {
                    const result = evaluateFormulaTyped(cell.formula, buildFormulaContext(tableId))
                    cell.computed = result.value
                    // Only auto-detect type if user hasn't explicitly set one
                    if (cell.cellType === 'empty') {
                        cell.computedType = result.type
                    }
                } catch {
                    cell.computed = '#ERROR!'
                    cell.computedType = 'text'
                }
                evaluating.delete(key)
                return cell.computed!
            }

            return cell.value
        }

        /** Build a FormulaContext for evaluating formulas inside a given table */
        function buildFormulaContext(tableId: string): import('../engine/formula').FormulaContext {
            // Determine which canvas this table belongs to, for local name resolution
            const sourceCanvas = findTableGlobal(tableId)
            const sourceCanvasId = sourceCanvas?.canvas.id

            return {
                getCellValue: (c, r) => resolveCellValue(tableId, c, r),
                getCellType: (c, r) => {
                    const refCell = getCellGlobal(tableId, c, r)
                    if (!refCell) return 'empty'
                    if (refCell.formula != null) {
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
                            const refCell = getCellGlobal(tableId, c, r)
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

                // ── Cross-table / cross-canvas resolution ──

                resolveExternalCellValue: (canvasName, tableName, c, r) => {
                    const t = findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return '#REF!'
                    return resolveCellValue(t.id, c, r)
                },
                resolveExternalCellType: (canvasName, tableName, c, r) => {
                    const t = findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return 'text'
                    const cell = getCellGlobal(t.id, c, r)
                    if (!cell) return 'empty'
                    if (cell.formula != null) {
                        resolveCellValue(t.id, c, r)
                        return cell.computedType ?? cell.cellType ?? 'empty'
                    }
                    return cell.cellType ?? 'empty'
                },
                resolveExternalCellRange: (canvasName, tableName, sc, sr, ec, er) => {
                    const t = findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return ['#REF!']
                    const vals: CellValue[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++)
                            vals.push(resolveCellValue(t.id, c, r))
                    return vals
                },
                resolveExternalCellRangeTypes: (canvasName, tableName, sc, sr, ec, er) => {
                    const t = findTableByName(tableName, canvasName, sourceCanvasId)
                    if (!t) return ['text' as CellDataType]
                    const types: CellDataType[] = []
                    for (let r = sr; r <= er; r++)
                        for (let c = sc; c <= ec; c++) {
                            const cell = getCellGlobal(t.id, c, r)
                            if (!cell) { types.push('empty'); continue }
                            if (cell.formula != null) {
                                resolveCellValue(t.id, c, r)
                                types.push(cell.computedType ?? cell.cellType ?? 'empty')
                            } else {
                                types.push(cell.cellType ?? 'empty')
                            }
                        }
                    return types
                },
            }
        }

        // Recalculate formulas across ALL canvases
        for (const cv of canvases.value) {
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++)
                    for (let c = 0; c < table.columns.length; c++)
                        if (table.rows[r][c].formula != null)
                            resolveCellValue(table.id, c, r)
            }
        }
    }

    // ── Name-reference rewriting helpers ──

    /**
     * Quote a name for formula/ref strings if it contains spaces or special chars,
     * otherwise return it bare.
     */
    function quoteRefName(n: string): string {
        return /^[A-Za-z_]\w*$/.test(n) ? n : `'${n}'`
    }

    /**
     * Build regex patterns that match a quoted or unquoted name in a formula/refString.
     * Returns a RegExp that matches `'Name'` or `Name` (unquoted, word-bounded) as used
     * before a `::` separator, capturing the name part.
     */
    function buildNamePattern(name: string): RegExp {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // Match either 'Name':: or Name:: (word-bounded for unquoted)
        return new RegExp(`(?:'${escaped}'|\\b${escaped}\\b)(?=::)`, 'g')
    }

    /**
     * Replace occurrences of an old name with a new name in a reference string
     * (formula body or chart refString).
     *
     * Handles both quoted ('Table 1') and unquoted (Table1) forms.
     */
    function replaceNameInRef(ref: string, oldName: string, newName: string): string {
        const pattern = buildNamePattern(oldName)
        return ref.replace(pattern, quoteRefName(newName))
    }

    /**
     * Rewrite all cell formulas and chart refStrings across all canvases
     * when a table name changes.
     */
    function rewriteTableNameReferences(oldName: string, newName: string) {
        for (const cv of canvases.value) {
            // Rewrite cell formulas
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++) {
                    for (let c = 0; c < table.columns.length; c++) {
                        const cell = table.rows[r][c]
                        if (cell.formula != null && cell.formula.length > 0) {
                            const updated = replaceNameInRef(cell.formula, oldName, newName)
                            if (updated !== cell.formula) {
                                cell.formula = updated
                            }
                        }
                    }
                }
            }
            // Rewrite chart data source refs
            for (const chart of cv.charts) {
                if (!chart.dataSource) continue
                if (chart.dataSource.labelRef) {
                    chart.dataSource.labelRef.refString = replaceNameInRef(
                        chart.dataSource.labelRef.refString, oldName, newName
                    )
                }
                for (const sref of chart.dataSource.seriesRefs) {
                    sref.refString = replaceNameInRef(sref.refString, oldName, newName)
                }
            }
        }
    }

    /**
     * Rewrite all cell formulas and chart refStrings across all canvases
     * when a canvas name changes.
     */
    function rewriteCanvasNameReferences(oldName: string, newName: string) {
        for (const cv of canvases.value) {
            // Rewrite cell formulas
            for (const table of cv.tables) {
                for (let r = 0; r < table.rows.length; r++) {
                    for (let c = 0; c < table.columns.length; c++) {
                        const cell = table.rows[r][c]
                        if (cell.formula != null && cell.formula.length > 0) {
                            const updated = replaceNameInRef(cell.formula, oldName, newName)
                            if (updated !== cell.formula) {
                                cell.formula = updated
                            }
                        }
                    }
                }
            }
            // Rewrite chart data source refs
            for (const chart of cv.charts) {
                if (!chart.dataSource) continue
                if (chart.dataSource.labelRef) {
                    chart.dataSource.labelRef.refString = replaceNameInRef(
                        chart.dataSource.labelRef.refString, oldName, newName
                    )
                }
                for (const sref of chart.dataSource.seriesRefs) {
                    sref.refString = replaceNameInRef(sref.refString, oldName, newName)
                }
            }
        }
    }

    // ── Helpers ──

    function findTable(id: string): SpreadsheetTable | undefined {
        // Fast path: check the active canvas first
        const local = activeCanvas.value.tables.find(t => t.id === id)
        if (local) return local
        // Fall back to global search across all canvases
        // (needed for cross-canvas formula editing, commit, display, etc.)
        return findTableGlobal(id)?.table
    }

    /** Search for a table by ID across ALL canvases */
    function findTableGlobal(id: string): { table: SpreadsheetTable; canvas: Canvas } | undefined {
        for (const cv of canvases.value) {
            const t = cv.tables.find(t => t.id === id)
            if (t) return { table: t, canvas: cv }
        }
        return undefined
    }

    /**
     * Find a table by its display name, optionally within a specific canvas.
     * When sourceCanvasId is provided, that canvas is searched first for
     * unqualified (no canvasName) references.
     */
    function findTableByName(tableName: string, canvasName?: string | null, sourceCanvasId?: string): SpreadsheetTable | undefined {
        if (canvasName) {
            const cv = canvases.value.find(c => c.name === canvasName)
            if (!cv) return undefined
            return cv.tables.find(t => t.name === tableName)
        }
        // Prefer the source canvas (the canvas containing the formula)
        if (sourceCanvasId) {
            const srcCv = canvases.value.find(c => c.id === sourceCanvasId)
            if (srcCv) {
                const local = srcCv.tables.find(t => t.name === tableName)
                if (local) return local
            }
        }
        // Fall back: search all canvases
        for (const cv of canvases.value) {
            const t = cv.tables.find(t => t.name === tableName)
            if (t) return t
        }
        return undefined
    }

    function findTextBox(id: string): TextBox | undefined {
        return activeCanvas.value.textBoxes.find(tb => tb.id === id)
    }

    // ── TextBox CRUD ──

    function addTextBox() {
        pushUndo()
        const canvas = activeCanvas.value
        const zoom = canvasZoom.value
        const offsetIdx = canvas.textBoxes.length
        const x = (-canvasOffset.value.x + 120 + offsetIdx * 30) / zoom
        const y = (-canvasOffset.value.y + 100 + offsetIdx * 30) / zoom
        const tb = createDefaultTextBox(x, y)
        tb.zIndex = ++maxZ
        canvas.textBoxes.push(tb)
        activeTextBoxId.value = tb.id
        activeCell.value = null
    }

    function removeTextBox(id: string) {
        pushUndo()
        const canvas = activeCanvas.value
        canvas.textBoxes = canvas.textBoxes.filter(tb => tb.id !== id)
        if (activeTextBoxId.value === id) activeTextBoxId.value = null
    }

    function moveTextBox(id: string, x: number, y: number) {
        startUndoBatch()
        const tb = findTextBox(id)
        if (tb) { tb.x = x; tb.y = y }
    }

    function resizeTextBox(id: string, width: number, height: number) {
        startUndoBatch()
        const tb = findTextBox(id)
        if (tb) {
            tb.width = Math.max(60, width)
            tb.height = Math.max(30, height)
        }
    }

    function updateTextBox(id: string, updates: Partial<TextBox>) {
        pushUndo()
        const tb = findTextBox(id)
        if (tb) Object.assign(tb, updates)
    }

    function selectTextBox(id: string) {
        if (isEditing.value) commitEdit()
        stopChartDataSelection()
        activeCell.value = null
        activeChartId.value = null
        selectionRange.value = null
        activeTextBoxId.value = id
        bringToFrontById(id)
    }

    // ── Charts ──

    function findChart(id: string): ChartObject | undefined {
        return charts.value.find(ch => ch.id === id)
    }

    function addChart() {
        pushUndo()
        const canvas = activeCanvas.value
        const zoom = canvasZoom.value
        const ox = canvasOffset.value.x
        const oy = canvasOffset.value.y
        const x = Math.round((200 - ox) / zoom)
        const y = Math.round((200 - oy) / zoom)
        const chart = createDefaultChart(x, y)
        chart.zIndex = ++maxZ
        canvas.charts.push(chart)
        activeCell.value = null
        activeTextBoxId.value = null
        activeChartId.value = chart.id
    }

    function removeChart(chartId: string) {
        pushUndo()
        const canvas = activeCanvas.value
        canvas.charts = canvas.charts.filter(ch => ch.id !== chartId)
        if (activeChartId.value === chartId) activeChartId.value = null
    }

    function moveChart(chartId: string, x: number, y: number) {
        startUndoBatch()
        const ch = findChart(chartId)
        if (ch) { ch.x = x; ch.y = y }
    }

    function resizeChart(chartId: string, width: number, height: number) {
        startUndoBatch()
        const ch = findChart(chartId)
        if (ch) {
            ch.width = Math.max(200, width)
            ch.height = Math.max(150, height)
        }
    }

    function updateChart(id: string, updates: Partial<ChartObject>) {
        pushUndo()
        const ch = findChart(id)
        if (ch) Object.assign(ch, updates)
    }

    function selectChart(id: string) {
        if (isEditing.value) commitEdit()
        if (activeChartId.value !== id) stopChartDataSelection()
        activeCell.value = null
        activeTextBoxId.value = null
        selectionRange.value = null
        activeChartId.value = id
        bringToFrontById(id)
    }

    // ── Chart data selection (Apple Numbers–style) ──

    /**
     * Enter chart data selection mode for a specific field.
     * @param mode 'labels' | 'series:0' | 'series:1' …
     */
    function startChartDataSelection(mode: string) {
        if (!activeChartId.value) return
        chartSelectionMode.value = mode
    }

    function stopChartDataSelection() {
        chartSelectionMode.value = null
    }

    /**
     * Called when the user finishes selecting a range while in chart selection mode.
     * Appends the new reference to the existing ref string (comma-separated)
     * so that disconnected cells from different tables/canvases are supported.
     * When isDragging=true, the last ref segment is replaced (drag extends the range)
     * instead of appending a new one.
     */
    function handleChartCellSelection(tableId: string, startCol: number, startRow: number, endCol: number, endRow: number, isDragging = false) {
        if (!chartSelectionMode.value || !activeChartId.value) return
        const chart = findChart(activeChartId.value)
        if (!chart) return

        const refStr = buildChartRefString(tableId, startCol, startRow, endCol, endRow)
        if (!refStr) return

        const mode = chartSelectionMode.value
        const ds = chart.dataSource
            ? { labelRef: chart.dataSource.labelRef, seriesRefs: [...chart.dataSource.seriesRefs], useHeader: chart.dataSource.useHeader }
            : { labelRef: null, seriesRefs: [], useHeader: true }

        if (mode === 'labels') {
            const existing = ds.labelRef?.refString ?? ''
            if (isDragging && existing) {
                // Replace last ref segment with updated range
                const parts = splitChartRefs(existing)
                parts[parts.length - 1] = refStr
                ds.labelRef = { refString: parts.join(',') }
            } else {
                ds.labelRef = { refString: existing ? `${existing},${refStr}` : refStr }
            }
        } else if (mode.startsWith('series:')) {
            const idx = parseInt(mode.split(':')[1])
            while (ds.seriesRefs.length <= idx) {
                ds.seriesRefs.push({ refString: '' })
            }
            const existing = ds.seriesRefs[idx].refString
            if (isDragging && existing) {
                // Replace last ref segment with updated range
                const parts = splitChartRefs(existing)
                parts[parts.length - 1] = refStr
                ds.seriesRefs[idx] = { refString: parts.join(',') }
            } else {
                ds.seriesRefs[idx] = { refString: existing ? `${existing},${refStr}` : refStr }
            }
        }

        updateChart(chart.id, { dataSource: ds })
    }

    /**
     * Build a fully-qualified reference string for a chart cell range.
     * Always includes the table name. Includes canvas name for cross-canvas refs.
     */
    function buildChartRefString(tableId: string, startCol: number, startRow: number, endCol: number, endRow: number): string {
        const info = findTableGlobal(tableId)
        if (!info) return ''

        const tableName = info.table.name
        const quoteIfNeeded = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`

        const startRef = `${indexToColumnLetter(startCol)}${startRow + 1}`
        const isSingleCell = startCol === endCol && startRow === endRow
        const cellRef = isSingleCell ? startRef : `${startRef}:${indexToColumnLetter(endCol)}${endRow + 1}`

        // Same canvas → table::ref
        if (info.canvas.id === activeCanvasId.value) {
            return `${quoteIfNeeded(tableName)}::${cellRef}`
        }

        // Different canvas → canvas::table::ref
        const canvasName = info.canvas.name
        return `${quoteIfNeeded(canvasName)}::${quoteIfNeeded(tableName)}::${cellRef}`
    }

    /**
     * Resolve a chart reference string into table ID and cell range.
     */
    function resolveChartRef(refString: string): { tableId: string; startCol: number; startRow: number; endCol: number; endRow: number } | null {
        if (!refString) return null
        const parts = refString.split('::')
        const cellPart = parts[parts.length - 1]

        // Parse cell/range part: "A1" or "A1:B5"
        const rangeParts = cellPart.split(':')
        const startMatch = rangeParts[0].match(/^([A-Z]+)(\d+)$/)
        if (!startMatch) return null

        const startCol = columnLetterToIndex(startMatch[1])
        const startRow = parseInt(startMatch[2]) - 1
        let endCol = startCol
        let endRow = startRow

        if (rangeParts.length === 2) {
            const endMatch = rangeParts[1].match(/^([A-Z]+)(\d+)$/)
            if (endMatch) {
                endCol = columnLetterToIndex(endMatch[1])
                endRow = parseInt(endMatch[2]) - 1
            }
        }

        const unquote = (s: string) => s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s

        if (parts.length === 2) {
            // table::ref
            const tableName = unquote(parts[0])
            const t = findTableByName(tableName)
            if (!t) return null
            return { tableId: t.id, startCol, startRow, endCol, endRow }
        }

        if (parts.length === 3) {
            // canvas::table::ref
            const canvasName = unquote(parts[0])
            const tableName = unquote(parts[1])
            const t = findTableByName(tableName, canvasName)
            if (!t) return null
            return { tableId: t.id, startCol, startRow, endCol, endRow }
        }

        return null
    }

    /**
     * Resolve values from a single contiguous chart ref.
     */
    function getValuesFromSingleRef(ref: string): CellValue[] {
        const resolved = resolveChartRef(ref.trim())
        if (!resolved) return []

        const info = findTableGlobal(resolved.tableId)
        if (!info) return []
        const table = info.table

        const values: CellValue[] = []
        for (let r = resolved.startRow; r <= resolved.endRow; r++) {
            for (let c = resolved.startCol; c <= resolved.endCol; c++) {
                const cell = table.rows[r]?.[c]
                if (!cell) { values.push(null); continue }
                if (cell.formula != null) {
                    values.push(cell.computed ?? null)
                } else {
                    values.push(cell.value)
                }
            }
        }
        return values
    }

    /**
     * Get cell values from a chart data reference.
     * Supports comma-separated multi-refs (e.g. "'Table 1'::A1:A5,'Table 2'::B2:B4")
     * for disconnected cells across different tables/canvases.
     */
    function getChartRefValues(refString: string): CellValue[] {
        if (!refString) return []
        // Split on commas that are NOT inside single quotes (to handle table names with commas)
        const refs = splitChartRefs(refString)
        const values: CellValue[] = []
        for (const ref of refs) {
            values.push(...getValuesFromSingleRef(ref))
        }
        return values
    }

    /**
     * Split a comma-separated chart ref string, respecting quoted names.
     * E.g. "'Table 1'::A1:A5,'My Table, v2'::B1" → ["'Table 1'::A1:A5", "'My Table, v2'::B1"]
     */
    function splitChartRefs(refString: string): string[] {
        const refs: string[] = []
        let current = ''
        let inQuote = false
        for (let i = 0; i < refString.length; i++) {
            const ch = refString[i]
            if (ch === "'") {
                inQuote = !inQuote
                current += ch
            } else if (ch === ',' && !inQuote) {
                if (current.trim()) refs.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
        if (current.trim()) refs.push(current.trim())
        return refs
    }

    /**
     * Get colored highlights for all data references of the active chart.
     * Used by SpreadsheetTable to draw colored outlines on referenced cells.
     */
    /** Expand a single resolved chart ref into cell highlights */
    function highlightsFromResolved(
        resolved: { tableId: string; startCol: number; startRow: number; endCol: number; endRow: number },
        color: string,
    ): Array<{ tableId: string; col: number; row: number; color: string }> {
        const out: Array<{ tableId: string; col: number; row: number; color: string }> = []
        for (let r = resolved.startRow; r <= resolved.endRow; r++) {
            for (let c = resolved.startCol; c <= resolved.endCol; c++) {
                out.push({ tableId: resolved.tableId, col: c, row: r, color })
            }
        }
        return out
    }

    function getChartDataHighlights(): Array<{ tableId: string; col: number; row: number; color: string }> {
        if (!activeChartId.value) return []
        const chart = findChart(activeChartId.value)
        if (!chart || !chart.dataSource) return []

        const ds = chart.dataSource
        const highlights: Array<{ tableId: string; col: number; row: number; color: string }> = []

        // Labels get a slate/gray color — supports comma-separated multi-refs
        if (ds.labelRef && ds.labelRef.refString) {
            const refs = splitChartRefs(ds.labelRef.refString)
            for (const ref of refs) {
                const resolved = resolveChartRef(ref)
                if (resolved) {
                    highlights.push(...highlightsFromResolved(resolved, '#94a3b8'))
                }
            }
        }

        // Each series gets a color — supports comma-separated multi-refs
        ds.seriesRefs.forEach((sref, i) => {
            if (!sref.refString) return
            const refs = splitChartRefs(sref.refString)
            const color = CHART_REF_COLORS[i % CHART_REF_COLORS.length]
            for (const ref of refs) {
                const resolved = resolveChartRef(ref)
                if (resolved) {
                    highlights.push(...highlightsFromResolved(resolved, color))
                }
            }
        })

        return highlights
    }

    /**
     * Add a new empty series slot to the active chart.
     */
    function addChartSeries() {
        if (!activeChartId.value) return
        const chart = findChart(activeChartId.value)
        if (!chart) return
        const ds = chart.dataSource
            ? { labelRef: chart.dataSource.labelRef, seriesRefs: [...chart.dataSource.seriesRefs], useHeader: chart.dataSource.useHeader }
            : { labelRef: null, seriesRefs: [], useHeader: true }
        ds.seriesRefs.push({ refString: '' })
        updateChart(chart.id, { dataSource: ds })
    }

    /**
     * Remove a series from the active chart by index.
     */
    function removeChartSeries(index: number) {
        if (!activeChartId.value) return
        const chart = findChart(activeChartId.value)
        if (!chart || !chart.dataSource) return
        const ds = { ...chart.dataSource, seriesRefs: [...chart.dataSource.seriesRefs] }
        ds.seriesRefs.splice(index, 1)
        updateChart(chart.id, { dataSource: ds })
        // If the removed series was being picked, stop selection
        if (chartSelectionMode.value === `series:${index}`) {
            stopChartDataSelection()
        }
    }

    /**
     * Set a chart data ref directly (e.g. when user types in the input field).
     * @param mode 'labels' | 'series:0' | 'series:1' …
     * @param refString the reference string
     */
    function setChartDataRef(mode: string, refString: string) {
        if (!activeChartId.value) return
        const chart = findChart(activeChartId.value)
        if (!chart) return
        const ds = chart.dataSource
            ? { labelRef: chart.dataSource.labelRef, seriesRefs: [...chart.dataSource.seriesRefs], useHeader: chart.dataSource.useHeader }
            : { labelRef: null, seriesRefs: [], useHeader: true }

        if (mode === 'labels') {
            ds.labelRef = refString ? { refString } : null
        } else if (mode.startsWith('series:')) {
            const idx = parseInt(mode.split(':')[1])
            while (ds.seriesRefs.length <= idx) {
                ds.seriesRefs.push({ refString: '' })
            }
            ds.seriesRefs[idx] = { refString }
        }

        updateChart(chart.id, { dataSource: ds })
    }

    /**
     * Get all tables across all canvases (for chart data source browsing).
     */
    function getAllTables(): Array<{ canvasId: string; canvasName: string; table: SpreadsheetTable }> {
        const result: Array<{ canvasId: string; canvasName: string; table: SpreadsheetTable }> = []
        for (const cv of canvases.value) {
            for (const t of cv.tables) {
                result.push({ canvasId: cv.id, canvasName: cv.name, table: t })
            }
        }
        return result
    }

    // ── File Operations ──

    const currentFilePath = ref<string | null>(null)

    function serializeState() {
        return JSON.stringify({
            version: '2.0',
            canvases: canvases.value,
            activeCanvasId: activeCanvasId.value,
        }, null, 2)
    }

    function migrateTableRows(rows: any[][]): Cell[][] {
        return (rows ?? []).map((row: any[]) =>
            row.map((cell: any) => {
                if (!cell.cellType) {
                    if (cell.value === null || cell.value === undefined) {
                        cell.cellType = 'empty'
                    } else if (typeof cell.value === 'boolean') {
                        cell.cellType = 'boolean'
                    } else if (typeof cell.value === 'number') {
                        cell.cellType = Number.isInteger(cell.value) ? 'integer' : 'float'
                    } else if (typeof cell.value === 'string') {
                        const detected = detectType(cell.value)
                        cell.cellType = detected.type
                    } else {
                        cell.cellType = 'text'
                    }
                }
                return cell
            })
        )
    }

    function migrateTable(t: any): SpreadsheetTable {
        return {
            ...t,
            mergedRegions: t.mergedRegions ?? [],
            rows: migrateTableRows(t.rows),
        }
    }

    /**
     * Migrate old-format chart data sources (tableId + labelCol + valueCols)
     * to new ref-based format (labelRef + seriesRefs).
     */
    function migrateChartDataSource(chart: any, allTables: SpreadsheetTable[]) {
        if (!chart.dataSource) return chart
        const ds = chart.dataSource

        // Already new format
        if ('labelRef' in ds || 'seriesRefs' in ds) return chart

        // Old format: { tableId, labelCol, valueCols, useHeader }
        if ('tableId' in ds && 'valueCols' in ds) {
            const table = allTables.find(t => t.id === ds.tableId)
            if (!table) {
                chart.dataSource = null
                return chart
            }
            const rowCount = table.rows.length
            const tableName = table.name
            const q = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`

            const buildRef = (col: number) => {
                const colLetter = indexToColumnLetter(col)
                return `${q(tableName)}::${colLetter}1:${colLetter}${rowCount}`
            }

            chart.dataSource = {
                labelRef: { refString: buildRef(ds.labelCol ?? 0) },
                seriesRefs: (ds.valueCols ?? []).map((col: number) => ({ refString: buildRef(col) })),
                useHeader: ds.useHeader ?? true,
            }
        }

        return chart
    }

    function deserializeState(jsonContent: string) {
        try {
            const data = JSON.parse(jsonContent)

            if (data.version === '2.0' && data.canvases) {
                // V2 format – multi-canvas
                canvases.value = data.canvases.map((cv: any) => {
                    const tables = (cv.tables ?? []).map(migrateTable)
                    const charts = (cv.charts ?? []).map((ch: any) => migrateChartDataSource(ch, tables))
                    return {
                        id: cv.id,
                        name: cv.name,
                        canvasOffset: cv.canvasOffset ?? { x: 0, y: 0 },
                        canvasZoom: cv.canvasZoom ?? 1.0,
                        tables,
                        textBoxes: cv.textBoxes ?? [],
                        charts,
                    }
                })
                canvasCount = canvases.value.length
                activeCanvasId.value = data.activeCanvasId ?? canvases.value[0].id
                const acv = activeCanvas.value
                maxZ = Math.max(0, ...acv.tables.map(t => t.zIndex), ...acv.textBoxes.map(tb => tb.zIndex), ...acv.charts.map(ch => ch.zIndex))
                tableCount = canvases.value.reduce((sum, cv) => sum + cv.tables.length, 0)
            } else if (data.tables) {
                // V1 format – single canvas, migrate
                const migrated = data.tables.map(migrateTable)
                const canvas = createDefaultCanvas('Canvas 1')
                canvas.tables = migrated
                if (data.canvasOffset) canvas.canvasOffset = data.canvasOffset
                canvases.value = [canvas]
                canvasCount = 1
                activeCanvasId.value = canvas.id
                maxZ = Math.max(0, ...migrated.map((t: SpreadsheetTable) => t.zIndex))
                tableCount = migrated.length
            }

            activeCell.value = null
            activeTextBoxId.value = null
            activeChartId.value = null
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
        return loadFileFromPath(filePath)
    }

    async function loadFileFromPath(filePath: string) {
        if (!window.electronAPI) return false

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
        const canvas = createDefaultCanvas('Canvas 1')
        canvases.value = [canvas]
        activeCanvasId.value = canvas.id
        activeCell.value = null
        activeTextBoxId.value = null
        activeChartId.value = null
        isEditing.value = false
        currentFilePath.value = null
        maxZ = 0
        tableCount = 0
        canvasCount = 1
    }

    return {
        // State
        canvases,
        activeCanvasId,
        activeCanvas,
        tables,
        textBoxes,
        charts,
        activeCell,
        activeTextBoxId,
        activeChartId,
        selectionRange,
        isEditing,
        editValue,
        formulaMode,
        canvasOffset,
        canvasZoom,
        currentFilePath,

        // Canvases
        addCanvas,
        removeCanvas,
        renameCanvas,
        switchCanvas,
        reorderCanvas,

        // Zoom
        setZoom,
        zoomIn,
        zoomOut,
        resetZoom,

        // Tables
        addTable,
        removeTable,
        bringToFront,
        bringToFrontById,
        renameTable,
        moveTable,

        // Text boxes
        addTextBox,
        removeTextBox,
        moveTextBox,
        resizeTextBox,
        updateTextBox,
        selectTextBox,
        findTextBox,

        // Charts
        addChart,
        removeChart,
        moveChart,
        resizeChart,
        updateChart,
        selectChart,
        findChart,

        // Chart data selection (Apple Numbers style)
        chartSelectionMode,
        chartSelectionActive,
        startChartDataSelection,
        stopChartDataSelection,
        handleChartCellSelection,
        resolveChartRef,
        getChartRefValues,
        getChartDataHighlights,
        addChartSeries,
        removeChartSeries,
        setChartDataRef,
        buildChartRefString,
        getAllTables,

        // Rows & Columns
        addRow,
        addColumn,
        deleteRow,
        deleteColumn,
        isRowEmpty,
        isColumnEmpty,
        removeLastRowIfEmpty,
        removeLastColumnIfEmpty,
        deleteSelectedRows,
        deleteSelectedColumns,
        insertRowAt,
        insertColumnAt,
        reorderRow,
        reorderRows,
        reorderColumn,
        reorderColumns,

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
        selectRow,
        selectColumn,
        extendSelection,
        extendRowSelection,
        extendColumnSelection,
        selectAll,
        getNormalizedSelection,
        isInSelection,
        isRowInSelection,
        isColInSelection,
        isEntireTableSelected,
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

        // Notes
        setCellNote,
        getCellNote,
        removeCellNote,
        cellHasNote,

        // Clipboard
        copyCells,
        cutCells,
        pasteCells,
        fillCells,
        shiftFormulaReferences,

        // Editing
        startEditing,
        commitEdit,
        cancelEdit,
        clearActiveCell,
        moveSelection,

        // Formula mode
        toggleFormulaMode,
        insertCellReference,
        buildCellReferenceString,
        formulaRefs,
        getFormulaTokens,
        getFormulaHighlights,

        recalculate,
        findTable,
        findTableGlobal,

        // File operations
        saveFile,
        saveAsFile,
        openFile,
        loadFileFromPath,
        newFile,

        // Undo / Redo
        undo,
        redo,
        canUndo,
        canRedo,
        startUndoBatch,
        endUndoBatch,
    }
}

export type SpreadsheetState = ReturnType<typeof useSpreadsheet>
export const SPREADSHEET_KEY = Symbol('spreadsheet') as InjectionKey<SpreadsheetState>
