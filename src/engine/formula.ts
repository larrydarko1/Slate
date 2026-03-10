/**
 * Slate Formula Engine
 *
 * Supports:
 *  - Arithmetic: +  -  *  /  ^
 *  - Concatenation: &
 *  - Comparison: =  <>  <  >  <=  >=
 *  - Cell references: A1, AB23
 *  - Range references: A1:C5
 *  - Cross-table references: 'Table 1'::A1, 'Table 1'::A1:B5
 *  - Cross-canvas references: 'Canvas 1'::'Table 1'::A1
 *  - Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, SQRT,
 *               POWER, MOD, INT, CEILING, FLOOR, IF, AND, OR, NOT, CONCAT,
 *               UPPER, LOWER, LEN, TRIM, LEFT, RIGHT, MID, PI, NOW, TODAY
 *
 * Type-aware evaluation:
 *  - Tracks CellDataType through operations
 *  - First operand sets target type for arithmetic
 *  - Text in arithmetic → #N/A
 *  - Mixed currency → first cell's currency wins
 */

import type { CellValue } from '../types/spreadsheet'
import { columnLetterToIndex } from '../types/spreadsheet'
import type { CellDataType } from './cellTypes'
import { resolveType, resolveTypeList, isNumericType } from './cellTypes'

// ── Public context the evaluator needs ──

export interface FormulaContext {
    getCellValue: (col: number, row: number) => CellValue
    getCellType: (col: number, row: number) => CellDataType
    getCellRange: (startCol: number, startRow: number, endCol: number, endRow: number) => CellValue[]
    getCellRangeTypes: (startCol: number, startRow: number, endCol: number, endRow: number) => CellDataType[]
    // Cross-table / cross-canvas resolution (optional – only provided by the composable)
    resolveExternalCellValue?: (canvasName: string | null, tableName: string, col: number, row: number) => CellValue
    resolveExternalCellType?: (canvasName: string | null, tableName: string, col: number, row: number) => CellDataType
    resolveExternalCellRange?: (canvasName: string | null, tableName: string, sc: number, sr: number, ec: number, er: number) => CellValue[]
    resolveExternalCellRangeTypes?: (canvasName: string | null, tableName: string, sc: number, sr: number, ec: number, er: number) => CellDataType[]
}

/** Result of a type-aware formula evaluation */
export interface TypedResult {
    value: CellValue
    type: CellDataType
}

// ── Tokens ──

type TokenType =
    | 'NUMBER' | 'STRING' | 'BOOLEAN'
    | 'CELL_REF' | 'IDENTIFIER' | 'QUOTED_NAME'
    | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'CARET' | 'AMP'
    | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LTE' | 'GTE'
    | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON' | 'DOUBLE_COLON'
    | 'EOF'

interface Token {
    type: TokenType
    value: string
    num?: number
}

// ── AST ──

export type ASTNode =
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'cell_ref'; col: number; row: number }
    | { type: 'range'; sc: number; sr: number; ec: number; er: number }
    | { type: 'external_cell_ref'; canvasName: string | null; tableName: string; col: number; row: number }
    | { type: 'external_range'; canvasName: string | null; tableName: string; sc: number; sr: number; ec: number; er: number }
    | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
    | { type: 'unary'; op: string; operand: ASTNode }
    | { type: 'function'; name: string; args: ASTNode[] }

// ── Tokenizer ──

function tokenize(src: string): Token[] {
    const tokens: Token[] = []
    let i = 0

    while (i < src.length) {
        // whitespace
        if (/\s/.test(src[i])) { i++; continue }

        // number
        if (/\d/.test(src[i])) {
            let n = ''
            while (i < src.length && /[\d.]/.test(src[i])) n += src[i++]
            tokens.push({ type: 'NUMBER', value: n, num: parseFloat(n) })
            continue
        }

        // string
        if (src[i] === '"') {
            i++
            let s = ''
            while (i < src.length && src[i] !== '"') s += src[i++]
            i++ // closing "
            tokens.push({ type: 'STRING', value: s })
            continue
        }

        // single-quoted name (for table/canvas references like 'Table 1')
        if (src[i] === "'") {
            i++
            let s = ''
            while (i < src.length && src[i] !== "'") s += src[i++]
            i++ // closing '
            tokens.push({ type: 'QUOTED_NAME', value: s })
            continue
        }

        // word (cell ref, identifier, boolean)
        if (/[A-Za-z_]/.test(src[i])) {
            let w = ''
            while (i < src.length && /[A-Za-z_]/.test(src[i])) w += src[i++]
            const up = w.toUpperCase()

            if (up === 'TRUE' || up === 'FALSE') {
                tokens.push({ type: 'BOOLEAN', value: up })
                continue
            }

            // If followed by digits → cell reference (e.g. AB23)
            if (i < src.length && /\d/.test(src[i])) {
                let digits = ''
                while (i < src.length && /\d/.test(src[i])) digits += src[i++]
                tokens.push({ type: 'CELL_REF', value: up + digits })
                continue
            }

            tokens.push({ type: 'IDENTIFIER', value: up })
            continue
        }

        // operators & punctuation
        const c = src[i]
        switch (c) {
            case '+': tokens.push({ type: 'PLUS', value: c }); break
            case '-': tokens.push({ type: 'MINUS', value: c }); break
            case '*': tokens.push({ type: 'STAR', value: c }); break
            case '/': tokens.push({ type: 'SLASH', value: c }); break
            case '^': tokens.push({ type: 'CARET', value: c }); break
            case '&': tokens.push({ type: 'AMP', value: c }); break
            case '(': tokens.push({ type: 'LPAREN', value: c }); break
            case ')': tokens.push({ type: 'RPAREN', value: c }); break
            case ',': tokens.push({ type: 'COMMA', value: c }); break
            case ':':
                if (src[i + 1] === ':') {
                    tokens.push({ type: 'DOUBLE_COLON', value: '::' })
                    i++ // skip second colon
                } else {
                    tokens.push({ type: 'COLON', value: c })
                }
                break
            case '=': tokens.push({ type: 'EQ', value: c }); break
            case '<':
                if (src[i + 1] === '>') { tokens.push({ type: 'NEQ', value: '<>' }); i++ }
                else if (src[i + 1] === '=') { tokens.push({ type: 'LTE', value: '<=' }); i++ }
                else tokens.push({ type: 'LT', value: '<' })
                break
            case '>':
                if (src[i + 1] === '=') { tokens.push({ type: 'GTE', value: '>=' }); i++ }
                else tokens.push({ type: 'GT', value: '>' })
                break
            default:
                throw new Error(`Unexpected character: ${c}`)
        }
        i++
    }

    tokens.push({ type: 'EOF', value: '' })
    return tokens
}

// ── Parser (recursive-descent) ──

function parseCellRef(ref: string): { col: number; row: number } {
    const m = ref.match(/^([A-Z]+)(\d+)$/)
    if (!m) throw new Error(`Invalid cell reference: ${ref}`)
    return { col: columnLetterToIndex(m[1]), row: parseInt(m[2]) - 1 }
}

class Parser {
    private tokens: Token[]
    private pos = 0

    constructor(tokens: Token[]) { this.tokens = tokens }

    private peek(): Token { return this.tokens[this.pos] }
    private advance(): Token { return this.tokens[this.pos++] }
    private expect(t: TokenType): Token {
        const tok = this.advance()
        if (tok.type !== t) throw new Error(`Expected ${t}, got ${tok.type}`)
        return tok
    }

    parse(): ASTNode {
        const node = this.expr()
        this.expect('EOF')
        return node
    }

    private expr(): ASTNode { return this.concat() }

    private concat(): ASTNode {
        let left = this.comparison()
        while (this.peek().type === 'AMP') {
            this.advance()
            left = { type: 'binary', op: '&', left, right: this.comparison() }
        }
        return left
    }

    private comparison(): ASTNode {
        let left = this.addition()
        const cmp: TokenType[] = ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE']
        while (cmp.includes(this.peek().type)) {
            const op = this.advance().value
            left = { type: 'binary', op, left, right: this.addition() }
        }
        return left
    }

    private addition(): ASTNode {
        let left = this.multiplication()
        while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
            const op = this.advance().value
            left = { type: 'binary', op, left, right: this.multiplication() }
        }
        return left
    }

    private multiplication(): ASTNode {
        let left = this.power()
        while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
            const op = this.advance().value
            left = { type: 'binary', op, left, right: this.power() }
        }
        return left
    }

    private power(): ASTNode {
        let left = this.unary()
        while (this.peek().type === 'CARET') {
            this.advance()
            left = { type: 'binary', op: '^', left, right: this.unary() }
        }
        return left
    }

    private unary(): ASTNode {
        if (this.peek().type === 'MINUS') {
            this.advance()
            return { type: 'unary', op: '-', operand: this.unary() }
        }
        if (this.peek().type === 'PLUS') {
            this.advance()
            return this.unary()
        }
        return this.primary()
    }

    /**
     * Parse an external (cross-table or cross-canvas) cell/range reference.
     * Called after consuming the first name token when :: follows.
     * Patterns:
     *   name :: CELL_REF            → external_cell_ref (same canvas)
     *   name :: CELL_REF : CELL_REF → external_range    (same canvas)
     *   name :: name :: CELL_REF            → external_cell_ref (cross-canvas)
     *   name :: name :: CELL_REF : CELL_REF → external_range    (cross-canvas)
     */
    private parseExternalRef(firstName: string): ASTNode {
        this.expect('DOUBLE_COLON')
        const next = this.peek()

        // Determine if this is canvas::table::ref or table::ref
        if (next.type === 'QUOTED_NAME' || next.type === 'IDENTIFIER' || next.type === 'CELL_REF') {
            this.advance()
            const secondName = next.value

            if (this.peek().type === 'DOUBLE_COLON') {
                // canvas :: table :: cellref
                this.advance() // consume ::
                const canvasName = firstName
                const tableName = secondName
                return this.parseCellOrRange(canvasName, tableName)
            }

            // table :: cellref
            // secondName should be a CELL_REF
            if (next.type === 'CELL_REF') {
                const { col, row } = parseCellRef(secondName)
                if (this.peek().type === 'COLON') {
                    this.advance()
                    const end = parseCellRef(this.expect('CELL_REF').value)
                    return { type: 'external_range', canvasName: null, tableName: firstName, sc: col, sr: row, ec: end.col, er: end.row }
                }
                return { type: 'external_cell_ref', canvasName: null, tableName: firstName, col, row }
            }

            // secondName is an IDENTIFIER/QUOTED_NAME but no :: follows → error
            throw new Error(`Expected :: or cell reference after '${secondName}'`)
        }

        throw new Error(`Expected table name or cell reference after ::`)
    }

    /** Parse a CELL_REF (or CELL_REF:CELL_REF range) in an external context */
    private parseCellOrRange(canvasName: string | null, tableName: string): ASTNode {
        const refTok = this.expect('CELL_REF')
        const { col, row } = parseCellRef(refTok.value)
        if (this.peek().type === 'COLON') {
            this.advance()
            const end = parseCellRef(this.expect('CELL_REF').value)
            return { type: 'external_range', canvasName, tableName, sc: col, sr: row, ec: end.col, er: end.row }
        }
        return { type: 'external_cell_ref', canvasName, tableName, col, row }
    }

    private primary(): ASTNode {
        const tok = this.peek()

        switch (tok.type) {
            case 'NUMBER':
                this.advance()
                return { type: 'number', value: tok.num! }

            case 'STRING':
                this.advance()
                return { type: 'string', value: tok.value }

            case 'BOOLEAN':
                this.advance()
                return { type: 'boolean', value: tok.value === 'TRUE' }

            case 'CELL_REF': {
                this.advance()
                // Check if this CELL_REF-looking token is actually a table name
                // followed by :: (e.g. Table1::A1)
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(tok.value)
                }
                const { col, row } = parseCellRef(tok.value)
                if (this.peek().type === 'COLON') {
                    this.advance()
                    const end = parseCellRef(this.expect('CELL_REF').value)
                    return { type: 'range', sc: col, sr: row, ec: end.col, er: end.row }
                }
                return { type: 'cell_ref', col, row }
            }

            case 'QUOTED_NAME': {
                this.advance()
                // Must be followed by :: for a cross-table/cross-canvas reference
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(tok.value)
                }
                throw new Error(`Unexpected quoted name: '${tok.value}' (expected ::)`)
            }

            case 'IDENTIFIER': {
                this.advance()
                const name = tok.value
                // Check if this is a table name prefix (e.g. Sales::A1)
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(name)
                }
                this.expect('LPAREN')
                const args: ASTNode[] = []
                if (this.peek().type !== 'RPAREN') {
                    args.push(this.expr())
                    while (this.peek().type === 'COMMA') { this.advance(); args.push(this.expr()) }
                }
                this.expect('RPAREN')
                return { type: 'function', name, args }
            }

            case 'LPAREN': {
                this.advance()
                const inner = this.expr()
                this.expect('RPAREN')
                return inner
            }

            default:
                throw new Error(`Unexpected token: ${tok.type} "${tok.value}"`)
        }
    }
}

// ── Evaluator helpers ──

function toNumber(v: CellValue): number {
    if (v === null || v === '') return 0
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'number') return v
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

interface TypedCellValue {
    value: CellValue
    type: CellDataType
}

function flattenArgs(args: ASTNode[], ctx: FormulaContext): CellValue[] {
    const out: CellValue[] = []
    for (const a of args) {
        if (a.type === 'range') {
            out.push(...ctx.getCellRange(a.sc, a.sr, a.ec, a.er))
        } else if (a.type === 'external_range') {
            if (!ctx.resolveExternalCellRange) throw new Error('Cross-table references not supported in this context')
            out.push(...ctx.resolveExternalCellRange(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er))
        } else {
            out.push(evaluateVal(a, ctx))
        }
    }
    return out
}

function flattenTypedArgs(args: ASTNode[], ctx: FormulaContext): TypedCellValue[] {
    const out: TypedCellValue[] = []
    for (const a of args) {
        if (a.type === 'range') {
            const vals = ctx.getCellRange(a.sc, a.sr, a.ec, a.er)
            const types = ctx.getCellRangeTypes(a.sc, a.sr, a.ec, a.er)
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' })
            }
        } else if (a.type === 'external_range') {
            if (!ctx.resolveExternalCellRange || !ctx.resolveExternalCellRangeTypes)
                throw new Error('Cross-table references not supported in this context')
            const vals = ctx.resolveExternalCellRange(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er)
            const types = ctx.resolveExternalCellRangeTypes(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er)
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' })
            }
        } else {
            const r = evaluate(a, ctx)
            out.push(r)
        }
    }
    return out
}

function numericValues(vals: CellValue[]): number[] {
    return vals.filter(v => v !== null && v !== '' && typeof v !== 'string').map(toNumber)
}

function numericTypedValues(vals: TypedCellValue[]): { nums: number[]; types: CellDataType[] } {
    const nums: number[] = []
    const types: CellDataType[] = []
    for (const v of vals) {
        if (v.value === null || v.value === '' || v.type === 'text') continue
        const n = toNumber(v.value)
        nums.push(n)
        types.push(v.type)
    }
    return { nums, types }
}

// ── Function dispatch ──

function evalFunction(name: string, args: ASTNode[], ctx: FormulaContext): TypedCellValue {
    switch (name) {
        case 'SUM': {
            const typed = flattenTypedArgs(args, ctx)
            // Propagate error values from any cell
            const errCell = typed.find(v => typeof v.value === 'string' && (v.value as string).startsWith('#'))
            if (errCell) return errCell
            const { nums, types } = numericTypedValues(typed)
            // Check for text values in input that are non-empty
            const hasText = typed.some(v => v.type === 'text' && v.value !== null && v.value !== '')
            if (hasText) return { value: '#N/A', type: 'text' }
            const resultType = resolveTypeList(types) ?? 'float'
            return { value: nums.reduce((a, b) => a + b, 0), type: resultType }
        }
        case 'AVERAGE': {
            const typed = flattenTypedArgs(args, ctx)
            // Propagate error values from any cell
            const errCellAvg = typed.find(v => typeof v.value === 'string' && (v.value as string).startsWith('#'))
            if (errCellAvg) return errCellAvg
            const { nums, types } = numericTypedValues(typed)
            const hasText = typed.some(v => v.type === 'text' && v.value !== null && v.value !== '')
            if (hasText) return { value: '#N/A', type: 'text' }
            if (nums.length === 0) return { value: '#DIV/0!', type: 'text' }
            const resultType = resolveTypeList(types) ?? 'float'
            // AVERAGE always returns at least float
            const finalType = resultType === 'integer' ? 'float' : resultType
            return { value: nums.reduce((a, b) => a + b, 0) / nums.length, type: finalType }
        }
        case 'MIN': {
            const typed = flattenTypedArgs(args, ctx)
            const errMin = typed.find(v => typeof v.value === 'string' && (v.value as string).startsWith('#'))
            if (errMin) return errMin
            const { nums, types } = numericTypedValues(typed)
            const resultType = resolveTypeList(types) ?? 'integer'
            return { value: nums.length ? Math.min(...nums) : 0, type: resultType }
        }
        case 'MAX': {
            const typed = flattenTypedArgs(args, ctx)
            const errMax = typed.find(v => typeof v.value === 'string' && (v.value as string).startsWith('#'))
            if (errMax) return errMax
            const { nums, types } = numericTypedValues(typed)
            const resultType = resolveTypeList(types) ?? 'integer'
            return { value: nums.length ? Math.max(...nums) : 0, type: resultType }
        }
        case 'COUNT': {
            return { value: numericValues(flattenArgs(args, ctx)).length, type: 'integer' }
        }
        case 'COUNTA': {
            return { value: flattenArgs(args, ctx).filter(v => v !== null && v !== '').length, type: 'integer' }
        }
        case 'ROUND': {
            const valR = evaluate(args[0], ctx)
            const val = toNumber(valR.value)
            const digits = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 0
            const f = Math.pow(10, digits)
            const rounded = Math.round(val * f) / f
            // If rounding to 0 digits and input is numeric, could be integer
            const resultType = digits === 0 ? (isNumericType(valR.type) ? valR.type : 'integer') : (isNumericType(valR.type) ? valR.type : 'float')
            return { value: rounded, type: resultType === 'integer' && digits > 0 ? 'float' : resultType }
        }
        case 'ABS': {
            const valA = evaluate(args[0], ctx)
            return { value: Math.abs(toNumber(valA.value)), type: isNumericType(valA.type) ? valA.type : 'float' }
        }
        case 'SQRT': {
            const valS = evaluate(args[0], ctx)
            const v = toNumber(valS.value)
            return { value: v < 0 ? '#NUM!' : Math.sqrt(v), type: v < 0 ? 'text' : 'float' }
        }
        case 'POWER': {
            const base = evaluate(args[0], ctx)
            return { value: Math.pow(toNumber(base.value), toNumber(evaluateVal(args[1], ctx))), type: 'float' }
        }
        case 'MOD': {
            const a = toNumber(evaluateVal(args[0], ctx))
            const b = toNumber(evaluateVal(args[1], ctx))
            return { value: b === 0 ? '#DIV/0!' : a % b, type: b === 0 ? 'text' : 'integer' }
        }
        case 'INT': {
            const valI = evaluate(args[0], ctx)
            return { value: Math.floor(toNumber(valI.value)), type: 'integer' }
        }
        case 'CEILING': {
            const val = toNumber(evaluateVal(args[0], ctx))
            const sig = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1
            return { value: sig === 0 ? 0 : Math.ceil(val / sig) * sig, type: 'float' }
        }
        case 'FLOOR': {
            const val = toNumber(evaluateVal(args[0], ctx))
            const sig = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1
            return { value: sig === 0 ? 0 : Math.floor(val / sig) * sig, type: 'float' }
        }

        // Logic
        case 'IF': {
            const cond = evaluateVal(args[0], ctx)
            const truthy = cond && cond !== 0 && cond !== '#ERROR!'
            return evaluate(truthy ? args[1] : (args[2] ?? { type: 'boolean', value: false }), ctx)
        }
        case 'AND': {
            const vals = flattenArgs(args, ctx)
            return { value: vals.every(v => v && v !== 0) ? true : false, type: 'boolean' }
        }
        case 'OR': {
            const vals = flattenArgs(args, ctx)
            return { value: vals.some(v => v && v !== 0) ? true : false, type: 'boolean' }
        }
        case 'NOT':
            return { value: !evaluateVal(args[0], ctx) ? true : false, type: 'boolean' }

        // Text
        case 'CONCAT': {
            return { value: flattenArgs(args, ctx).map(v => v ?? '').join(''), type: 'text' }
        }
        case 'UPPER':
            return { value: String(evaluateVal(args[0], ctx) ?? '').toUpperCase(), type: 'text' }
        case 'LOWER':
            return { value: String(evaluateVal(args[0], ctx) ?? '').toLowerCase(), type: 'text' }
        case 'LEN':
            return { value: String(evaluateVal(args[0], ctx) ?? '').length, type: 'integer' }
        case 'TRIM':
            return { value: String(evaluateVal(args[0], ctx) ?? '').trim(), type: 'text' }
        case 'LEFT': {
            const s = String(evaluateVal(args[0], ctx) ?? '')
            const n = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1
            return { value: s.substring(0, n), type: 'text' }
        }
        case 'RIGHT': {
            const s = String(evaluateVal(args[0], ctx) ?? '')
            const n = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1
            return { value: s.substring(s.length - n), type: 'text' }
        }
        case 'MID': {
            const s = String(evaluateVal(args[0], ctx) ?? '')
            const start = toNumber(evaluateVal(args[1], ctx)) - 1
            const len = toNumber(evaluateVal(args[2], ctx))
            return { value: s.substring(start, start + len), type: 'text' }
        }

        // Constants / Date
        case 'PI':
            return { value: Math.PI, type: 'float' }
        case 'NOW':
            return { value: new Date().toLocaleString(), type: 'text' }
        case 'TODAY':
            return { value: new Date().toLocaleDateString(), type: 'text' }

        default:
            return { value: `#NAME? (${name})`, type: 'text' }
    }
}

// ── Main evaluator (type-aware) ──

function evaluate(node: ASTNode, ctx: FormulaContext): TypedCellValue {
    switch (node.type) {
        case 'number':
            return { value: node.value, type: Number.isInteger(node.value) ? 'integer' : 'float' }
        case 'string':
            return { value: node.value, type: 'text' }
        case 'boolean':
            return { value: node.value, type: 'boolean' }
        case 'cell_ref':
            return { value: ctx.getCellValue(node.col, node.row), type: ctx.getCellType(node.col, node.row) }
        case 'external_cell_ref': {
            if (!ctx.resolveExternalCellValue || !ctx.resolveExternalCellType)
                throw new Error('Cross-table references not supported in this context')
            return {
                value: ctx.resolveExternalCellValue(node.canvasName, node.tableName, node.col, node.row),
                type: ctx.resolveExternalCellType(node.canvasName, node.tableName, node.col, node.row),
            }
        }
        case 'range':
            throw new Error('Range can only be used as a function argument')
        case 'external_range':
            throw new Error('External range can only be used as a function argument')

        case 'unary': {
            const operand = evaluate(node.operand, ctx)
            // Propagate error values
            if (typeof operand.value === 'string' && operand.value.startsWith('#')) return operand
            if (node.op === '-') {
                return { value: -toNumber(operand.value), type: operand.type }
            }
            return operand
        }

        case 'binary': {
            if (node.op === '&') {
                const lConcat = evaluateVal(node.left, ctx)
                const rConcat = evaluateVal(node.right, ctx)
                // Propagate errors through concatenation
                if (typeof lConcat === 'string' && lConcat.startsWith('#')) return { value: lConcat, type: 'text' }
                if (typeof rConcat === 'string' && rConcat.startsWith('#')) return { value: rConcat, type: 'text' }
                return {
                    value: String(lConcat ?? '') + String(rConcat ?? ''),
                    type: 'text'
                }
            }
            const l = evaluate(node.left, ctx)
            const r = evaluate(node.right, ctx)

            // Propagate error values (e.g. #REF!, #CIRCULAR!, #ERROR!)
            if (typeof l.value === 'string' && l.value.startsWith('#')) return l
            if (typeof r.value === 'string' && r.value.startsWith('#')) return r

            // Comparison operators
            if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
                switch (node.op) {
                    case '=': return { value: l.value === r.value, type: 'boolean' }
                    case '<>': return { value: l.value !== r.value, type: 'boolean' }
                    case '<': return { value: toNumber(l.value) < toNumber(r.value), type: 'boolean' }
                    case '>': return { value: toNumber(l.value) > toNumber(r.value), type: 'boolean' }
                    case '<=': return { value: toNumber(l.value) <= toNumber(r.value), type: 'boolean' }
                    case '>=': return { value: toNumber(l.value) >= toNumber(r.value), type: 'boolean' }
                }
            }

            // Arithmetic: check type compatibility
            const resolvedType = resolveType(l.type, r.type)

            // Text in arithmetic → #N/A
            if (resolvedType === null) {
                // One is text and the other is numeric
                if ((l.type === 'text' && l.value !== null && l.value !== '') ||
                    (r.type === 'text' && r.value !== null && r.value !== '')) {
                    return { value: '#N/A', type: 'text' }
                }
                // Both empty or compatible, fall through
            }

            const lNum = toNumber(l.value)
            const rNum = toNumber(r.value)

            switch (node.op) {
                case '+': return { value: lNum + rNum, type: resolvedType ?? 'float' }
                case '-': return { value: lNum - rNum, type: resolvedType ?? 'float' }
                case '*': {
                    // Multiplying currency by integer/float keeps currency
                    const multType = isNumericType(l.type) && (r.type === 'integer' || r.type === 'float')
                        ? l.type
                        : (isNumericType(r.type) && (l.type === 'integer' || l.type === 'float')
                            ? r.type
                            : resolvedType ?? 'float')
                    return { value: lNum * rNum, type: multType }
                }
                case '/': {
                    if (rNum === 0) return { value: '#DIV/0!', type: 'text' }
                    // Dividing currency by number keeps currency; currency / currency → float
                    let divType = resolvedType ?? 'float'
                    if ((l.type === 'currency_eur' || l.type === 'currency_usd') &&
                        (r.type === 'currency_eur' || r.type === 'currency_usd')) {
                        divType = 'float' // currency / currency = ratio
                    }
                    return { value: lNum / rNum, type: divType }
                }
                case '^': return { value: Math.pow(lNum, rNum), type: 'float' }
                default: return { value: '#OP!', type: 'text' }
            }
        }

        case 'function':
            return evalFunction(node.name, node.args, ctx)
    }
}

/** Convenience: evaluate and return just the value (for backward compat) */
function evaluateVal(node: ASTNode, ctx: FormulaContext): CellValue {
    return evaluate(node, ctx).value
}

// ── Public API ──

export function evaluateFormula(formulaBody: string, ctx: FormulaContext): CellValue {
    try {
        const tokens = tokenize(formulaBody)
        const ast = new Parser(tokens).parse()
        return evaluate(ast, ctx).value
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return `#ERROR! ${msg}`
    }
}

/** Type-aware formula evaluation — returns both value and resolved type */
export function evaluateFormulaTyped(formulaBody: string, ctx: FormulaContext): TypedResult {
    try {
        const tokens = tokenize(formulaBody)
        const ast = new Parser(tokens).parse()
        const result = evaluate(ast, ctx)
        return { value: result.value, type: result.type }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return { value: `#ERROR! ${msg}`, type: 'text' }
    }
}
