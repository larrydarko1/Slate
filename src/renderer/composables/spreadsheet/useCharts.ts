// useCharts — chart CRUD, data selection (Apple Numbers–style), and reference resolution.
// Owns: addChart, removeChart, moveChart, resizeChart, updateChart, selectChart,
//       chart data selection mode, ref building/resolving/highlighting.
// Does NOT own: cell access (useCells.ts), formula engine (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import { CHART_REF_COLORS } from './state'
import type { ChartObject, SpreadsheetTable, CellValue } from '../../types/spreadsheet'
import { createDefaultChart, indexToColumnLetter, columnLetterToIndex } from '../../types/spreadsheet'

interface ChartsDeps {
    findChart: SpreadsheetHelpers['findChart']
    findTableGlobal: SpreadsheetHelpers['findTableGlobal']
    findTableByName: SpreadsheetHelpers['findTableByName']
    bringToFrontById: SpreadsheetHelpers['bringToFrontById']
    pushUndo: () => void
    startUndoBatch: () => void
    commitEdit: () => void
}

export function createCharts(state: SpreadsheetCoreState, deps: ChartsDeps) {

    function addChart(): void {
        deps.pushUndo()
        const canvas = state.activeCanvas.value
        const zoom = state.canvasZoom.value
        const ox = state.canvasOffset.value.x
        const oy = state.canvasOffset.value.y
        const x = Math.round((200 - ox) / zoom)
        const y = Math.round((200 - oy) / zoom)
        const chart = createDefaultChart(x, y)
        chart.zIndex = ++state.counters.maxZ
        canvas.charts.push(chart)
        state.activeCell.value = null
        state.activeTextBoxId.value = null
        state.activeChartId.value = chart.id
    }

    function removeChart(chartId: string): void {
        deps.pushUndo()
        const canvas = state.activeCanvas.value
        canvas.charts = canvas.charts.filter(ch => ch.id !== chartId)
        if (state.activeChartId.value === chartId) state.activeChartId.value = null
    }

    function moveChart(chartId: string, x: number, y: number): void {
        deps.startUndoBatch()
        const ch = deps.findChart(chartId)
        if (ch) { ch.x = x; ch.y = y }
    }

    function resizeChart(chartId: string, width: number, height: number): void {
        deps.startUndoBatch()
        const ch = deps.findChart(chartId)
        if (ch) {
            ch.width = Math.max(200, width)
            ch.height = Math.max(150, height)
        }
    }

    function updateChart(id: string, updates: Partial<ChartObject>): void {
        deps.pushUndo()
        const ch = deps.findChart(id)
        if (ch) Object.assign(ch, updates)
    }

    function selectChart(id: string): void {
        if (state.isEditing.value) deps.commitEdit()
        if (state.activeChartId.value !== id) stopChartDataSelection()
        state.activeCell.value = null
        state.activeTextBoxId.value = null
        state.selectionRange.value = null
        state.activeChartId.value = id
        deps.bringToFrontById(id)
    }

    // ── Chart data selection mode ────────────────────────────────────────────

    function startChartDataSelection(mode: string): void {
        if (!state.activeChartId.value) return
        state.chartSelectionMode.value = mode
    }

    function stopChartDataSelection(): void {
        state.chartSelectionMode.value = null
    }

    function handleChartCellSelection(
        tableId: string,
        startCol: number, startRow: number,
        endCol: number, endRow: number,
        isDragging = false,
    ): void {
        if (!state.chartSelectionMode.value || !state.activeChartId.value) return
        const chart = deps.findChart(state.activeChartId.value)
        if (!chart) return

        const refStr = buildChartRefString(tableId, startCol, startRow, endCol, endRow)
        if (!refStr) return

        const mode = state.chartSelectionMode.value
        const ds = chart.dataSource
            ? { labelRef: chart.dataSource.labelRef, seriesRefs: [...chart.dataSource.seriesRefs], useHeader: chart.dataSource.useHeader }
            : { labelRef: null, seriesRefs: [], useHeader: true }

        if (mode === 'labels') {
            const existing = ds.labelRef?.refString ?? ''
            if (isDragging && existing) {
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
                const parts = splitChartRefs(existing)
                parts[parts.length - 1] = refStr
                ds.seriesRefs[idx] = { refString: parts.join(',') }
            } else {
                ds.seriesRefs[idx] = { refString: existing ? `${existing},${refStr}` : refStr }
            }
        }

        updateChart(chart.id, { dataSource: ds })
    }

    function buildChartRefString(
        tableId: string,
        startCol: number, startRow: number,
        endCol: number, endRow: number,
    ): string {
        const info = deps.findTableGlobal(tableId)
        if (!info) return ''

        const tableName = info.table.name
        const quoteIfNeeded = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`

        const startRef = `${indexToColumnLetter(startCol)}${startRow + 1}`
        const isSingleCell = startCol === endCol && startRow === endRow
        const cellRef = isSingleCell ? startRef : `${startRef}:${indexToColumnLetter(endCol)}${endRow + 1}`

        if (info.canvas.id === state.activeCanvasId.value) {
            return `${quoteIfNeeded(tableName)}::${cellRef}`
        }

        const canvasName = info.canvas.name
        return `${quoteIfNeeded(canvasName)}::${quoteIfNeeded(tableName)}::${cellRef}`
    }

    function resolveChartRef(refString: string): { tableId: string; startCol: number; startRow: number; endCol: number; endRow: number } | null {
        if (!refString) return null
        const parts = refString.split('::')
        const cellPart = parts[parts.length - 1]

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
            const tableName = unquote(parts[0])
            const t = deps.findTableByName(tableName)
            if (!t) return null
            return { tableId: t.id, startCol, startRow, endCol, endRow }
        }

        if (parts.length === 3) {
            const canvasName = unquote(parts[0])
            const tableName = unquote(parts[1])
            const t = deps.findTableByName(tableName, canvasName)
            if (!t) return null
            return { tableId: t.id, startCol, startRow, endCol, endRow }
        }

        return null
    }

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

    function getValuesFromSingleRef(ref: string): CellValue[] {
        const resolved = resolveChartRef(ref.trim())
        if (!resolved) return []

        const info = deps.findTableGlobal(resolved.tableId)
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

    function getChartRefValues(refString: string): CellValue[] {
        if (!refString) return []
        const refs = splitChartRefs(refString)
        const values: CellValue[] = []
        for (const ref of refs) {
            values.push(...getValuesFromSingleRef(ref))
        }
        return values
    }

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
        if (!state.activeChartId.value) return []
        const chart = deps.findChart(state.activeChartId.value)
        if (!chart || !chart.dataSource) return []

        const ds = chart.dataSource
        const highlights: Array<{ tableId: string; col: number; row: number; color: string }> = []

        if (ds.labelRef && ds.labelRef.refString) {
            const refs = splitChartRefs(ds.labelRef.refString)
            for (const ref of refs) {
                const resolved = resolveChartRef(ref)
                if (resolved) {
                    highlights.push(...highlightsFromResolved(resolved, '#94a3b8'))
                }
            }
        }

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

    function addChartSeries(): void {
        if (!state.activeChartId.value) return
        const chart = deps.findChart(state.activeChartId.value)
        if (!chart) return
        const ds = chart.dataSource
            ? { labelRef: chart.dataSource.labelRef, seriesRefs: [...chart.dataSource.seriesRefs], useHeader: chart.dataSource.useHeader }
            : { labelRef: null, seriesRefs: [], useHeader: true }
        ds.seriesRefs.push({ refString: '' })
        updateChart(chart.id, { dataSource: ds })
    }

    function removeChartSeries(index: number): void {
        if (!state.activeChartId.value) return
        const chart = deps.findChart(state.activeChartId.value)
        if (!chart || !chart.dataSource) return
        const ds = { ...chart.dataSource, seriesRefs: [...chart.dataSource.seriesRefs] }
        ds.seriesRefs.splice(index, 1)
        updateChart(chart.id, { dataSource: ds })
        if (state.chartSelectionMode.value === `series:${index}`) {
            stopChartDataSelection()
        }
    }

    function setChartDataRef(mode: string, refString: string): void {
        if (!state.activeChartId.value) return
        const chart = deps.findChart(state.activeChartId.value)
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

    function getAllTables(): Array<{ canvasId: string; canvasName: string; table: SpreadsheetTable }> {
        const result: Array<{ canvasId: string; canvasName: string; table: SpreadsheetTable }> = []
        for (const cv of state.canvases.value) {
            for (const t of cv.tables) {
                result.push({ canvasId: cv.id, canvasName: cv.name, table: t })
            }
        }
        return result
    }

    return {
        addChart, removeChart, moveChart, resizeChart,
        updateChart, selectChart,
        startChartDataSelection, stopChartDataSelection,
        handleChartCellSelection,
        resolveChartRef, getChartRefValues, getChartDataHighlights,
        addChartSeries, removeChartSeries, setChartDataRef,
        buildChartRefString, getAllTables, splitChartRefs,
    }
}

export type SpreadsheetCharts = ReturnType<typeof createCharts>
