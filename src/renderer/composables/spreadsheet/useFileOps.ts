// useFileOps — file operations, serialization, deserialization, and migration.
// Owns: save, saveAs, open, loadFileFromPath, newFile, serialize/deserialize.
// Does NOT own: reactive state (state.ts), recalculation (useFormulaEngine.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import type { SpreadsheetTable, Cell } from '../../types/spreadsheet'
import { createDefaultCanvas, indexToColumnLetter } from '../../types/spreadsheet'
import { detectType } from '../../engine/cellTypes'

interface FileOpsDeps {
    recalculate: () => void
    recalculateMaxZ: SpreadsheetHelpers['recalculateMaxZ']
}

export function createFileOps(state: SpreadsheetCoreState, deps: FileOpsDeps) {

    function serializeState(): string {
        return JSON.stringify({
            version: '2.0',
            canvases: state.canvases.value,
            activeCanvasId: state.activeCanvasId.value,
        }, null, 2)
    }

    // ── Migration helpers ────────────────────────────────────────────────────

    function migrateTableRows(rows: unknown[][]): Cell[][] {
        return (rows ?? []).map((row: unknown[]) =>
            row.map((cell: unknown) => {
                const c = cell as Record<string, unknown>
                if (!c.cellType) {
                    if (c.value === null || c.value === undefined) {
                        c.cellType = 'empty'
                    } else if (typeof c.value === 'boolean') {
                        c.cellType = 'boolean'
                    } else if (typeof c.value === 'number') {
                        c.cellType = Number.isInteger(c.value) ? 'integer' : 'float'
                    } else if (typeof c.value === 'string') {
                        const detected = detectType(c.value)
                        c.cellType = detected.type
                    } else {
                        c.cellType = 'text'
                    }
                }
                return c as unknown as Cell
            })
        )
    }

    function migrateTable(t: Record<string, unknown>): SpreadsheetTable {
        return {
            ...t,
            mergedRegions: (t.mergedRegions as unknown[]) ?? [],
            rows: migrateTableRows(t.rows as unknown[][]),
        } as SpreadsheetTable
    }

    function migrateChartDataSource(chart: Record<string, unknown>, allTables: SpreadsheetTable[]): Record<string, unknown> {
        if (!chart.dataSource) return chart
        const ds = chart.dataSource as Record<string, unknown>

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
                labelRef: { refString: buildRef((ds.labelCol as number) ?? 0) },
                seriesRefs: ((ds.valueCols as number[]) ?? []).map((col: number) => ({ refString: buildRef(col) })),
                useHeader: (ds.useHeader as boolean) ?? true,
            }
        }

        return chart
    }

    // ── Deserialization ──────────────────────────────────────────────────────

    function deserializeState(jsonContent: string): boolean {
        try {
            const data = JSON.parse(jsonContent) as Record<string, unknown>

            if (data.version === '2.0' && data.canvases) {
                const rawCanvases = data.canvases as Record<string, unknown>[]
                state.canvases.value = rawCanvases.map((cv) => {
                    const tables = ((cv.tables as unknown[]) ?? []).map(
                        (t) => migrateTable(t as Record<string, unknown>),
                    )
                    const charts = ((cv.charts as unknown[]) ?? []).map(
                        (ch) => migrateChartDataSource(ch as Record<string, unknown>, tables),
                    )
                    return {
                        id: cv.id as string,
                        name: cv.name as string,
                        canvasOffset: (cv.canvasOffset as { x: number; y: number }) ?? { x: 0, y: 0 },
                        canvasZoom: (cv.canvasZoom as number) ?? 1.0,
                        tables,
                        textBoxes: (cv.textBoxes as unknown[]) ?? [],
                        charts,
                    }
                }) as typeof state.canvases.value

                state.counters.canvasCount = state.canvases.value.length
                state.activeCanvasId.value = (data.activeCanvasId as string) ?? state.canvases.value[0].id
                deps.recalculateMaxZ()
                state.counters.tableCount = state.canvases.value.reduce(
                    (sum, cv) => sum + cv.tables.length, 0,
                )
            } else if ((data as Record<string, unknown>).tables) {
                // V1 format — single canvas, migrate
                const migrated = ((data as Record<string, unknown>).tables as unknown[]).map(
                    (t) => migrateTable(t as Record<string, unknown>),
                )
                const canvas = createDefaultCanvas('Canvas 1')
                canvas.tables = migrated
                if ((data as Record<string, unknown>).canvasOffset) {
                    canvas.canvasOffset = (data as Record<string, unknown>).canvasOffset as { x: number; y: number }
                }
                state.canvases.value = [canvas]
                state.counters.canvasCount = 1
                state.activeCanvasId.value = canvas.id
                state.counters.maxZ = Math.max(0, ...migrated.map((t: SpreadsheetTable) => t.zIndex))
                state.counters.tableCount = migrated.length
            }

            state.activeCell.value = null
            state.activeTextBoxId.value = null
            state.activeChartId.value = null
            state.isEditing.value = false
            deps.recalculate()
            return true
        } catch (error) {
            console.error('Failed to load file:', error)
            return false
        }
    }

    // ── File I/O ─────────────────────────────────────────────────────────────

    async function saveFile(filePath?: string): Promise<boolean> {
        if (!window.electronAPI) {
            alert('File operations require Electron')
            return false
        }

        let targetPath = filePath || state.currentFilePath.value

        if (!targetPath) {
            const result = await window.electronAPI.showSaveDialog()
            if (result.canceled || !result.filePath) return false
            targetPath = result.filePath
        }

        const content = serializeState()
        const result = await window.electronAPI.writeFile(targetPath, content)

        if (result.success) {
            state.currentFilePath.value = targetPath
            return true
        } else {
            alert(`Failed to save file: ${result.error}`)
            return false
        }
    }

    async function saveAsFile(): Promise<boolean> {
        return await saveFile(undefined)
    }

    async function openFile(): Promise<boolean> {
        if (!window.electronAPI) {
            alert('File operations require Electron')
            return false
        }

        const result = await window.electronAPI.showOpenDialog()
        if (result.canceled || result.filePaths.length === 0) return false

        const filePath = result.filePaths[0]
        return loadFileFromPath(filePath)
    }

    async function loadFileFromPath(filePath: string): Promise<boolean> {
        if (!window.electronAPI) return false

        const readResult = await window.electronAPI.readFile(filePath)

        if (readResult.success && readResult.content) {
            if (deserializeState(readResult.content)) {
                state.currentFilePath.value = filePath
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

    function newFile(): void {
        const canvas = createDefaultCanvas('Canvas 1')
        state.canvases.value = [canvas]
        state.activeCanvasId.value = canvas.id
        state.activeCell.value = null
        state.activeTextBoxId.value = null
        state.activeChartId.value = null
        state.isEditing.value = false
        state.currentFilePath.value = null
        state.counters.maxZ = 0
        state.counters.tableCount = 0
        state.counters.canvasCount = 1
    }

    return { saveFile, saveAsFile, openFile, loadFileFromPath, newFile }
}

export type SpreadsheetFileOps = ReturnType<typeof createFileOps>
