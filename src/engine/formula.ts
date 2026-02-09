/**
 * Slate Formula Engine
 *
 * Supports:
 *  - Arithmetic: +  -  *  /  ^
 *  - Concatenation: &
 *  - Comparison: =  <>  <  >  <=  >=
 *  - Cell references: A1, AB23
 *  - Range references: A1:C5
 *  - Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, SQRT,
 *               POWER, MOD, INT, IF, AND, OR, NOT, CONCAT, UPPER, LOWER,
 *               LEN, TRIM, LEFT, RIGHT, MID, PI, NOW, TODAY
 */

import type { CellValue } from '../types/spreadsheet'
import { columnLetterToIndex } from '../types/spreadsheet'

// ── Public context the evaluator needs ──

export interface FormulaContext {
    getCellValue: (col: number, row: number) => CellValue
    getCellRange: (startCol: number, startRow: number, endCol: number, endRow: number) => CellValue[]
}

// ── Tokens ──

type TokenType =
    | 'NUMBER' | 'STRING' | 'BOOLEAN'
    | 'CELL_REF' | 'IDENTIFIER'
    | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'CARET' | 'AMP'
    | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LTE' | 'GTE'
    | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON'
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
            case ':': tokens.push({ type: 'COLON', value: c }); break
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
                const { col, row } = parseCellRef(tok.value)
                if (this.peek().type === 'COLON') {
                    this.advance()
                    const end = parseCellRef(this.expect('CELL_REF').value)
                    return { type: 'range', sc: col, sr: row, ec: end.col, er: end.row }
                }
                return { type: 'cell_ref', col, row }
            }

            case 'IDENTIFIER': {
                this.advance()
                const name = tok.value
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

function flattenArgs(args: ASTNode[], ctx: FormulaContext): CellValue[] {
    const out: CellValue[] = []
    for (const a of args) {
        if (a.type === 'range') {
            out.push(...ctx.getCellRange(a.sc, a.sr, a.ec, a.er))
        } else {
            out.push(evaluate(a, ctx))
        }
    }
    return out
}

function numericValues(vals: CellValue[]): number[] {
    return vals.filter(v => v !== null && v !== '' && typeof v !== 'string').map(toNumber)
}

// ── Function dispatch ──

function evalFunction(name: string, args: ASTNode[], ctx: FormulaContext): CellValue {
    switch (name) {
        case 'SUM': {
            const nums = numericValues(flattenArgs(args, ctx))
            return nums.reduce((a, b) => a + b, 0)
        }
        case 'AVERAGE': {
            const nums = numericValues(flattenArgs(args, ctx))
            if (nums.length === 0) return '#DIV/0!'
            return nums.reduce((a, b) => a + b, 0) / nums.length
        }
        case 'MIN': {
            const nums = numericValues(flattenArgs(args, ctx))
            return nums.length ? Math.min(...nums) : 0
        }
        case 'MAX': {
            const nums = numericValues(flattenArgs(args, ctx))
            return nums.length ? Math.max(...nums) : 0
        }
        case 'COUNT': {
            return numericValues(flattenArgs(args, ctx)).length
        }
        case 'COUNTA': {
            return flattenArgs(args, ctx).filter(v => v !== null && v !== '').length
        }
        case 'ROUND': {
            const val = toNumber(evaluate(args[0], ctx))
            const digits = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 0
            const f = Math.pow(10, digits)
            return Math.round(val * f) / f
        }
        case 'ABS':
            return Math.abs(toNumber(evaluate(args[0], ctx)))
        case 'SQRT': {
            const v = toNumber(evaluate(args[0], ctx))
            return v < 0 ? '#NUM!' : Math.sqrt(v)
        }
        case 'POWER':
            return Math.pow(toNumber(evaluate(args[0], ctx)), toNumber(evaluate(args[1], ctx)))
        case 'MOD': {
            const a = toNumber(evaluate(args[0], ctx))
            const b = toNumber(evaluate(args[1], ctx))
            return b === 0 ? '#DIV/0!' : a % b
        }
        case 'INT':
            return Math.floor(toNumber(evaluate(args[0], ctx)))
        case 'CEILING': {
            const val = toNumber(evaluate(args[0], ctx))
            const sig = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 1
            return sig === 0 ? 0 : Math.ceil(val / sig) * sig
        }
        case 'FLOOR': {
            const val = toNumber(evaluate(args[0], ctx))
            const sig = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 1
            return sig === 0 ? 0 : Math.floor(val / sig) * sig
        }

        // Logic
        case 'IF': {
            const cond = evaluate(args[0], ctx)
            const truthy = cond && cond !== 0 && cond !== '#ERROR!'
            return evaluate(truthy ? args[1] : (args[2] ?? { type: 'boolean', value: false }), ctx)
        }
        case 'AND': {
            const vals = flattenArgs(args, ctx)
            return vals.every(v => v && v !== 0) ? true : false
        }
        case 'OR': {
            const vals = flattenArgs(args, ctx)
            return vals.some(v => v && v !== 0) ? true : false
        }
        case 'NOT':
            return !evaluate(args[0], ctx) ? true : false

        // Text
        case 'CONCAT': {
            return flattenArgs(args, ctx).map(v => v ?? '').join('')
        }
        case 'UPPER':
            return String(evaluate(args[0], ctx) ?? '').toUpperCase()
        case 'LOWER':
            return String(evaluate(args[0], ctx) ?? '').toLowerCase()
        case 'LEN':
            return String(evaluate(args[0], ctx) ?? '').length
        case 'TRIM':
            return String(evaluate(args[0], ctx) ?? '').trim()
        case 'LEFT': {
            const s = String(evaluate(args[0], ctx) ?? '')
            const n = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 1
            return s.substring(0, n)
        }
        case 'RIGHT': {
            const s = String(evaluate(args[0], ctx) ?? '')
            const n = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 1
            return s.substring(s.length - n)
        }
        case 'MID': {
            const s = String(evaluate(args[0], ctx) ?? '')
            const start = toNumber(evaluate(args[1], ctx)) - 1
            const len = toNumber(evaluate(args[2], ctx))
            return s.substring(start, start + len)
        }

        // Constants / Date
        case 'PI':
            return Math.PI
        case 'NOW':
            return new Date().toLocaleString()
        case 'TODAY':
            return new Date().toLocaleDateString()

        default:
            return `#NAME? (${name})`
    }
}

// ── Main evaluator ──

function evaluate(node: ASTNode, ctx: FormulaContext): CellValue {
    switch (node.type) {
        case 'number': return node.value
        case 'string': return node.value
        case 'boolean': return node.value
        case 'cell_ref': return ctx.getCellValue(node.col, node.row)
        case 'range': throw new Error('Range can only be used as a function argument')

        case 'unary':
            if (node.op === '-') return -toNumber(evaluate(node.operand, ctx))
            return evaluate(node.operand, ctx)

        case 'binary': {
            if (node.op === '&') {
                return String(evaluate(node.left, ctx) ?? '') + String(evaluate(node.right, ctx) ?? '')
            }
            const l = evaluate(node.left, ctx)
            const r = evaluate(node.right, ctx)
            switch (node.op) {
                case '+': return toNumber(l) + toNumber(r)
                case '-': return toNumber(l) - toNumber(r)
                case '*': return toNumber(l) * toNumber(r)
                case '/': return toNumber(r) === 0 ? '#DIV/0!' : toNumber(l) / toNumber(r)
                case '^': return Math.pow(toNumber(l), toNumber(r))
                case '=': return l === r
                case '<>': return l !== r
                case '<': return toNumber(l) < toNumber(r)
                case '>': return toNumber(l) > toNumber(r)
                case '<=': return toNumber(l) <= toNumber(r)
                case '>=': return toNumber(l) >= toNumber(r)
                default: return '#OP!'
            }
        }

        case 'function':
            return evalFunction(node.name, node.args, ctx)
    }
}

// ── Public API ──

export function evaluateFormula(formulaBody: string, ctx: FormulaContext): CellValue {
    try {
        const tokens = tokenize(formulaBody)
        const ast = new Parser(tokens).parse()
        return evaluate(ast, ctx)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return `#ERROR! ${msg}`
    }
}
