import { ref, computed, type InjectionKey } from 'vue'
import type { SpreadsheetTable, Cell, CellValue, CellReference, MergedRegion, SelectionRange, Canvas, TextBox, ChartObject } from '../types/spreadsheet'
import { generateId, createDefaultTable, createEmptyCell, createDefaultCanvas, createDefaultTextBox, createDefaultChart, MAX_CANVASES, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../types/spreadsheet'
import { evaluateFormulaTyped } from '../engine/formula'
import type { CellDataType } from '../engine/cellTypes'
import { detectType, formatCellDisplay, getTypeAlignment } from '../engine/cellTypes'

export function useSpreadsheet() {
    const canvases = ref<Canvas[]>([createDefaultCanvas('Canvas 1')])
    const activeCanvasId = ref<string>(canvases.value[0].id)

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
    let maxZ = 0
    let tableCount = 0
    let canvasCount = 1

    // ── Canvas CRUD ──

    function addCanvas() {
        if (canvases.value.length >= MAX_CANVASES) return
        canvasCount++
        const c = createDefaultCanvas(`Canvas ${canvasCount}`)
        canvases.value.push(c)
        switchCanvas(c.id)
    }

    function removeCanvas(canvasId: string) {
        if (canvases.value.length <= 1) return // always keep at least one
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
        const c = canvases.value.find(cv => cv.id === canvasId)
        if (c) c.name = name
    }

    function switchCanvas(canvasId: string) {
        if (isEditing.value) commitEdit()
        activeCell.value = null
        activeTextBoxId.value = null
        activeChartId.value = null
        selectionRange.value = null
        isEditing.value = false
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

        for (const table of activeCanvas.value.tables) {
            for (let r = 0; r < table.rows.length; r++)
                for (let c = 0; c < table.columns.length; c++)
                    if (table.rows[r][c].formula != null)
                        resolveCellValue(table.id, c, r)
        }
    }

    // ── Helpers ──

    function findTable(id: string): SpreadsheetTable | undefined {
        return activeCanvas.value.tables.find(t => t.id === id)
    }

    function findTextBox(id: string): TextBox | undefined {
        return activeCanvas.value.textBoxes.find(tb => tb.id === id)
    }

    // ── TextBox CRUD ──

    function addTextBox() {
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
        const canvas = activeCanvas.value
        canvas.textBoxes = canvas.textBoxes.filter(tb => tb.id !== id)
        if (activeTextBoxId.value === id) activeTextBoxId.value = null
    }

    function moveTextBox(id: string, x: number, y: number) {
        const tb = findTextBox(id)
        if (tb) { tb.x = x; tb.y = y }
    }

    function resizeTextBox(id: string, width: number, height: number) {
        const tb = findTextBox(id)
        if (tb) {
            tb.width = Math.max(60, width)
            tb.height = Math.max(30, height)
        }
    }

    function updateTextBox(id: string, updates: Partial<TextBox>) {
        const tb = findTextBox(id)
        if (tb) Object.assign(tb, updates)
    }

    function selectTextBox(id: string) {
        if (isEditing.value) commitEdit()
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
        const canvas = activeCanvas.value
        canvas.charts = canvas.charts.filter(ch => ch.id !== chartId)
        if (activeChartId.value === chartId) activeChartId.value = null
    }

    function moveChart(chartId: string, x: number, y: number) {
        const ch = findChart(chartId)
        if (ch) { ch.x = x; ch.y = y }
    }

    function resizeChart(chartId: string, width: number, height: number) {
        const ch = findChart(chartId)
        if (ch) {
            ch.width = Math.max(200, width)
            ch.height = Math.max(150, height)
        }
    }

    function updateChart(id: string, updates: Partial<ChartObject>) {
        const ch = findChart(id)
        if (ch) Object.assign(ch, updates)
    }

    function selectChart(id: string) {
        if (isEditing.value) commitEdit()
        activeCell.value = null
        activeTextBoxId.value = null
        selectionRange.value = null
        activeChartId.value = id
        bringToFrontById(id)
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

    function deserializeState(jsonContent: string) {
        try {
            const data = JSON.parse(jsonContent)

            if (data.version === '2.0' && data.canvases) {
                // V2 format – multi-canvas
                canvases.value = data.canvases.map((cv: any) => ({
                    id: cv.id,
                    name: cv.name,
                    canvasOffset: cv.canvasOffset ?? { x: 0, y: 0 },
                    canvasZoom: cv.canvasZoom ?? 1.0,
                    tables: (cv.tables ?? []).map(migrateTable),
                    textBoxes: cv.textBoxes ?? [],
                    charts: cv.charts ?? [],
                }))
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
