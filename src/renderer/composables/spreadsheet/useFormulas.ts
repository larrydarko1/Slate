// useFormulas — formula editing mode, token parsing, highlights, and cell reference insertion.
// Owns: toggleFormulaMode, insertCellReference, getFormulaTokens, getFormulaHighlights.
// Does NOT own: recalculation (useFormulaEngine.ts), cell access (useCells.ts).

import type { SpreadsheetCoreState } from './state'
import type { SpreadsheetHelpers } from './helpers'
import { REF_COLORS } from './state'
import type { Cell } from '../../types/spreadsheet'
import { indexToColumnLetter, columnLetterToIndex } from '../../types/spreadsheet'

interface FormulaToken {
    text: string
    isRef: boolean
    color?: string
    tableId?: string
    col?: number
    row?: number
    endCol?: number
    endRow?: number
    isRange?: boolean
}

interface FormulasDeps {
    findTableGlobal: SpreadsheetHelpers['findTableGlobal']
    findTableByName: SpreadsheetHelpers['findTableByName']
    getCell: (tableId: string, col: number, row: number) => Cell | null
    startEditing: (initialValue?: string) => void
}

export function createFormulas(state: SpreadsheetCoreState, deps: FormulasDeps) {

    function buildCellReferenceString(targetTableId: string, col: number, row: number): string {
        if (!state.activeCell.value) return ''
        const colLetter = indexToColumnLetter(col)
        const rowNum = row + 1
        const cellRef = `${colLetter}${rowNum}`

        if (targetTableId === state.activeCell.value.tableId) {
            return cellRef
        }

        const targetInfo = deps.findTableGlobal(targetTableId)
        if (!targetInfo) return cellRef

        const sourceInfo = deps.findTableGlobal(state.activeCell.value.tableId)
        const targetTableName = targetInfo.table.name
        const quoteTable = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`

        if (sourceInfo && sourceInfo.canvas.id === targetInfo.canvas.id) {
            return `${quoteTable(targetTableName)}::${cellRef}`
        }

        const targetCanvasName = targetInfo.canvas.name
        const quoteCanvas = (n: string) => n.match(/^[A-Za-z_]\w*$/) ? n : `'${n}'`
        return `${quoteCanvas(targetCanvasName)}::${quoteTable(targetTableName)}::${cellRef}`
    }

    function insertCellReference(tableId: string, col: number, row: number): void {
        if (!state.isEditing.value || !state.formulaMode.value) return

        const refStr = buildCellReferenceString(tableId, col, row)
        if (!refStr) return

        const color = REF_COLORS[state.formulaRefs.value.length % REF_COLORS.length]
        state.formulaRefs.value.push({ tableId, col, row, refString: refStr, color })

        let current = state.editValue.value
        if (!current || current === '=') {
            state.editValue.value = '=' + refStr
            return
        }

        const trimmed = current.trimEnd()
        const lastChar = trimmed[trimmed.length - 1]

        if (lastChar && '+-*/^(,'.includes(lastChar)) {
            state.editValue.value = current + refStr
        } else {
            state.editValue.value = current + '+' + refStr
        }
    }

    function resolveRefString(refText: string): { tableId: string; col: number; row: number; endCol?: number; endRow?: number; isRange?: boolean } | null {
        if (!state.activeCell.value) return null

        const parts = refText.split('::')
        const cellPart = parts[parts.length - 1]

        const rangeMatch = cellPart.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
        const singleMatch = !rangeMatch ? cellPart.match(/^([A-Z]+)(\d+)$/) : null

        if (!rangeMatch && !singleMatch) return null

        const col = columnLetterToIndex(rangeMatch ? rangeMatch[1] : singleMatch![1])
        const row = parseInt(rangeMatch ? rangeMatch[2] : singleMatch![2]) - 1
        const endCol = rangeMatch ? columnLetterToIndex(rangeMatch[3]) : undefined
        const endRow = rangeMatch ? parseInt(rangeMatch[4]) - 1 : undefined
        const isRange = !!rangeMatch

        const buildResult = (tableId: string) => ({ tableId, col, row, endCol, endRow, isRange })

        if (parts.length === 1) {
            return buildResult(state.activeCell.value.tableId)
        }

        const unquote = (s: string) => s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s

        if (parts.length === 2) {
            const tableName = unquote(parts[0])
            const t = deps.findTableByName(tableName)
            if (!t) return null
            return buildResult(t.id)
        }

        if (parts.length === 3) {
            const canvasName = unquote(parts[0])
            const tableName = unquote(parts[1])
            const t = deps.findTableByName(tableName, canvasName)
            if (!t) return null
            return buildResult(t.id)
        }

        return null
    }

    function getFormulaTokens(formulaOverride?: string): FormulaToken[] {
        const val = formulaOverride ?? state.editValue.value
        if (!val.startsWith('=')) return [{ text: val, isRef: false }]

        const body = val.substring(1)
        const tokens: FormulaToken[] = []
        const refRegex = /(?:(?:'[^']*'|\w+)::)*(?:(?:'[^']*'|\w+)::)?[A-Z]+\d+(?::[A-Z]+\d+)?/g
        let lastIndex = 0
        let colorIdx = 0
        let match: RegExpExecArray | null

        while ((match = refRegex.exec(body)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({ text: body.substring(lastIndex, match.index), isRef: false })
            }
            const refText = match[0]
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

    function getFormulaHighlights(): Array<{ tableId: string; col: number; row: number; color: string }> {
        let tokens: FormulaToken[]

        if (state.isEditing.value && state.editValue.value.startsWith('=')) {
            tokens = getFormulaTokens()
        } else if (!state.isEditing.value && state.activeCell.value) {
            const cell = deps.getCell(state.activeCell.value.tableId, state.activeCell.value.col, state.activeCell.value.row)
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

    function toggleFormulaMode(): void {
        if (!state.activeCell.value) return
        state.formulaMode.value = !state.formulaMode.value
        if (state.formulaMode.value && !state.isEditing.value) {
            deps.startEditing('=')
        }
        if (!state.formulaMode.value) {
            state.formulaRefs.value = []
        }
    }

    return {
        toggleFormulaMode,
        insertCellReference, buildCellReferenceString,
        getFormulaTokens, resolveRefString, getFormulaHighlights,
    }
}

export type SpreadsheetFormulas = ReturnType<typeof createFormulas>
