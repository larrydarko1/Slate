import { ref, type InjectionKey } from 'vue'
import type { SpreadsheetTable, Cell, CellValue, CellReference } from '../types/spreadsheet'
import { generateId, createDefaultTable, createEmptyCell } from '../types/spreadsheet'
import { evaluateFormula } from '../engine/formula'

export function useSpreadsheet() {
    const tables = ref<SpreadsheetTable[]>([])
    const activeCell = ref<CellReference | null>(null)
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
        t.rows.splice(rowIdx, 1)
        if (activeCell.value?.tableId === tableId && activeCell.value.row >= t.rows.length) {
            activeCell.value.row = t.rows.length - 1
        }
        recalculate()
    }

    function deleteColumn(tableId: string, colIdx: number) {
        const t = findTable(tableId)
        if (!t || t.columns.length <= 1) return
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
        t.rows.splice(rowIdx, 0, t.columns.map(() => createEmptyCell()))
        recalculate()
    }

    function insertColumnAt(tableId: string, colIdx: number) {
        const t = findTable(tableId)
        if (!t) return
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
        } else {
            cell.formula = undefined
            cell.computed = undefined
            if (raw === '') {
                cell.value = null
            } else {
                const n = Number(raw)
                if (!isNaN(n) && raw.trim() !== '') cell.value = n
                else if (raw.toLowerCase() === 'true') cell.value = true
                else if (raw.toLowerCase() === 'false') cell.value = false
                else cell.value = raw
            }
        }

        recalculate()
    }

    function getDisplayValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''
        const v = cell.formula != null ? cell.computed : cell.value
        if (v === null || v === undefined) return ''
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
        if (typeof v === 'number') {
            if (Number.isInteger(v)) return v.toString()
            return parseFloat(v.toFixed(10)).toString()
        }
        return String(v)
    }

    function getRawValue(tableId: string, col: number, row: number): string {
        const cell = getCell(tableId, col, row)
        if (!cell) return ''
        if (cell.formula != null) return '=' + cell.formula
        if (cell.value === null) return ''
        return String(cell.value)
    }

    // ── Editing state ──

    function selectCell(tableId: string, col: number, row: number) {
        if (isEditing.value) commitEdit()
        activeCell.value = { tableId, col, row }
        bringToFront(tableId)
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
                    cell.computed = evaluateFormula(cell.formula, {
                        getCellValue: (c, r) => resolveCellValue(tableId, c, r),
                        getCellRange: (sc, sr, ec, er) => {
                            const vals: CellValue[] = []
                            for (let r = sr; r <= er; r++)
                                for (let c = sc; c <= ec; c++)
                                    vals.push(resolveCellValue(tableId, c, r))
                            return vals
                        },
                    })
                } catch {
                    cell.computed = '#ERROR!'
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
                tables.value = data.tables
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

        // Editing
        selectCell,
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
