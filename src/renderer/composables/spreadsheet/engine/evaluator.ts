// evaluator — type-aware AST evaluator for the Slate formula engine.
// Owns: evaluate, evaluateVal, evalFunction, type coercion helpers.
// Does NOT own: tokenization (tokenizer.ts), parsing (parser.ts), public API (formula.ts).

import type { CellValue } from '../../../types/spreadsheet';
import type { CellDataType } from './cellTypes';
import { resolveType, resolveTypeList, isNumericType } from './cellTypes';
import type { FormulaContext } from './formula';
import type { ASTNode } from './parser';

// ── Type helpers ─────────────────────────────────────────────────────────────

export function toNumber(v: CellValue): number {
    if (v === null || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

export interface TypedCellValue {
    value: CellValue;
    type: CellDataType;
}

// ── Argument flattening ──────────────────────────────────────────────────────

function flattenArgs(args: ASTNode[], ctx: FormulaContext): CellValue[] {
    const out: CellValue[] = [];
    for (const a of args) {
        if (a.type === 'range') {
            out.push(...ctx.getCellRange(a.sc, a.sr, a.ec, a.er));
        } else if (a.type === 'external_range') {
            if (!ctx.resolveExternalCellRange) throw new Error('Cross-table references not supported in this context');
            out.push(...ctx.resolveExternalCellRange(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er));
        } else {
            out.push(evaluateVal(a, ctx));
        }
    }
    return out;
}

function flattenTypedArgs(args: ASTNode[], ctx: FormulaContext): TypedCellValue[] {
    const out: TypedCellValue[] = [];
    for (const a of args) {
        if (a.type === 'range') {
            const vals = ctx.getCellRange(a.sc, a.sr, a.ec, a.er);
            const types = ctx.getCellRangeTypes(a.sc, a.sr, a.ec, a.er);
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' });
            }
        } else if (a.type === 'external_range') {
            if (!ctx.resolveExternalCellRange || !ctx.resolveExternalCellRangeTypes)
                throw new Error('Cross-table references not supported in this context');
            const vals = ctx.resolveExternalCellRange(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er);
            const types = ctx.resolveExternalCellRangeTypes(a.canvasName, a.tableName, a.sc, a.sr, a.ec, a.er);
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' });
            }
        } else {
            const r = evaluate(a, ctx);
            out.push(r);
        }
    }
    return out;
}

function numericValues(vals: CellValue[]): number[] {
    return vals.filter((v) => v !== null && v !== '' && typeof v !== 'string').map(toNumber);
}

function numericTypedValues(vals: TypedCellValue[]): { nums: number[]; types: CellDataType[] } {
    const nums: number[] = [];
    const types: CellDataType[] = [];
    for (const v of vals) {
        if (v.value === null || v.value === '' || v.type === 'text') continue;
        const n = toNumber(v.value);
        nums.push(n);
        types.push(v.type);
    }
    return { nums, types };
}

// ── Function dispatch ────────────────────────────────────────────────────────

function evalFunction(name: string, args: ASTNode[], ctx: FormulaContext): TypedCellValue {
    switch (name) {
        case 'SUM': {
            const typed = flattenTypedArgs(args, ctx);
            const errCell = typed.find((v) => typeof v.value === 'string' && (v.value as string).startsWith('#'));
            if (errCell) return errCell;
            const { nums, types } = numericTypedValues(typed);
            const hasText = typed.some((v) => v.type === 'text' && v.value !== null && v.value !== '');
            if (hasText) return { value: '#N/A', type: 'text' };
            const resultType = resolveTypeList(types) ?? 'float';
            return { value: nums.reduce((a, b) => a + b, 0), type: resultType };
        }
        case 'AVERAGE': {
            const typed = flattenTypedArgs(args, ctx);
            const errCellAvg = typed.find((v) => typeof v.value === 'string' && (v.value as string).startsWith('#'));
            if (errCellAvg) return errCellAvg;
            const { nums, types } = numericTypedValues(typed);
            const hasText = typed.some((v) => v.type === 'text' && v.value !== null && v.value !== '');
            if (hasText) return { value: '#N/A', type: 'text' };
            if (nums.length === 0) return { value: '#DIV/0!', type: 'text' };
            const resultType = resolveTypeList(types) ?? 'float';
            // AVERAGE always returns at least float
            const finalType = resultType === 'integer' ? 'float' : resultType;
            return { value: nums.reduce((a, b) => a + b, 0) / nums.length, type: finalType };
        }
        case 'MIN': {
            const typed = flattenTypedArgs(args, ctx);
            const errMin = typed.find((v) => typeof v.value === 'string' && (v.value as string).startsWith('#'));
            if (errMin) return errMin;
            const { nums, types } = numericTypedValues(typed);
            const resultType = resolveTypeList(types) ?? 'integer';
            return { value: nums.length ? Math.min(...nums) : 0, type: resultType };
        }
        case 'MAX': {
            const typed = flattenTypedArgs(args, ctx);
            const errMax = typed.find((v) => typeof v.value === 'string' && (v.value as string).startsWith('#'));
            if (errMax) return errMax;
            const { nums, types } = numericTypedValues(typed);
            const resultType = resolveTypeList(types) ?? 'integer';
            return { value: nums.length ? Math.max(...nums) : 0, type: resultType };
        }
        case 'COUNT': {
            return { value: numericValues(flattenArgs(args, ctx)).length, type: 'integer' };
        }
        case 'COUNTA': {
            return { value: flattenArgs(args, ctx).filter((v) => v !== null && v !== '').length, type: 'integer' };
        }
        case 'ROUND': {
            const valR = evaluate(args[0], ctx);
            const val = toNumber(valR.value);
            const digits = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 0;
            const f = Math.pow(10, digits);
            const rounded = Math.round(val * f) / f;
            const resultType =
                digits === 0
                    ? isNumericType(valR.type)
                        ? valR.type
                        : 'integer'
                    : isNumericType(valR.type)
                      ? valR.type
                      : 'float';
            return { value: rounded, type: resultType === 'integer' && digits > 0 ? 'float' : resultType };
        }
        case 'ABS': {
            const valA = evaluate(args[0], ctx);
            return { value: Math.abs(toNumber(valA.value)), type: isNumericType(valA.type) ? valA.type : 'float' };
        }
        case 'SQRT': {
            const valS = evaluate(args[0], ctx);
            const v = toNumber(valS.value);
            return { value: v < 0 ? '#NUM!' : Math.sqrt(v), type: v < 0 ? 'text' : 'float' };
        }
        case 'POWER': {
            const base = evaluate(args[0], ctx);
            return { value: Math.pow(toNumber(base.value), toNumber(evaluateVal(args[1], ctx))), type: 'float' };
        }
        case 'MOD': {
            const a = toNumber(evaluateVal(args[0], ctx));
            const b = toNumber(evaluateVal(args[1], ctx));
            return { value: b === 0 ? '#DIV/0!' : a % b, type: b === 0 ? 'text' : 'integer' };
        }
        case 'INT': {
            const valI = evaluate(args[0], ctx);
            return { value: Math.floor(toNumber(valI.value)), type: 'integer' };
        }
        case 'CEILING': {
            const val = toNumber(evaluateVal(args[0], ctx));
            const sig = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: sig === 0 ? 0 : Math.ceil(val / sig) * sig, type: 'float' };
        }
        case 'FLOOR': {
            const val = toNumber(evaluateVal(args[0], ctx));
            const sig = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: sig === 0 ? 0 : Math.floor(val / sig) * sig, type: 'float' };
        }

        // Logic
        case 'IF': {
            const cond = evaluateVal(args[0], ctx);
            const truthy = cond && cond !== 0 && cond !== '#ERROR!';
            return evaluate(truthy ? args[1] : (args[2] ?? { type: 'boolean', value: false }), ctx);
        }
        case 'AND': {
            const vals = flattenArgs(args, ctx);
            return { value: vals.every((v) => v && v !== 0) ? true : false, type: 'boolean' };
        }
        case 'OR': {
            const vals = flattenArgs(args, ctx);
            return { value: vals.some((v) => v && v !== 0) ? true : false, type: 'boolean' };
        }
        case 'NOT':
            return { value: !evaluateVal(args[0], ctx) ? true : false, type: 'boolean' };

        // Text
        case 'CONCAT': {
            return {
                value: flattenArgs(args, ctx)
                    .map((v) => v ?? '')
                    .join(''),
                type: 'text',
            };
        }
        case 'UPPER':
            return { value: String(evaluateVal(args[0], ctx) ?? '').toUpperCase(), type: 'text' };
        case 'LOWER':
            return { value: String(evaluateVal(args[0], ctx) ?? '').toLowerCase(), type: 'text' };
        case 'LEN':
            return { value: String(evaluateVal(args[0], ctx) ?? '').length, type: 'integer' };
        case 'TRIM':
            return { value: String(evaluateVal(args[0], ctx) ?? '').trim(), type: 'text' };
        case 'LEFT': {
            const s = String(evaluateVal(args[0], ctx) ?? '');
            const n = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: s.substring(0, n), type: 'text' };
        }
        case 'RIGHT': {
            const s = String(evaluateVal(args[0], ctx) ?? '');
            const n = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: s.substring(s.length - n), type: 'text' };
        }
        case 'MID': {
            const s = String(evaluateVal(args[0], ctx) ?? '');
            const start = toNumber(evaluateVal(args[1], ctx)) - 1;
            const len = toNumber(evaluateVal(args[2], ctx));
            return { value: s.substring(start, start + len), type: 'text' };
        }

        // Constants / Date
        case 'PI':
            return { value: Math.PI, type: 'float' };
        case 'NOW':
            return { value: new Date().toLocaleString(), type: 'text' };
        case 'TODAY':
            return { value: new Date().toLocaleDateString(), type: 'text' };

        default:
            return { value: `#NAME? (${name})`, type: 'text' };
    }
}

// ── Main evaluator (type-aware) ──────────────────────────────────────────────

export function evaluate(node: ASTNode, ctx: FormulaContext): TypedCellValue {
    switch (node.type) {
        case 'number':
            return { value: node.value, type: Number.isInteger(node.value) ? 'integer' : 'float' };
        case 'string':
            return { value: node.value, type: 'text' };
        case 'boolean':
            return { value: node.value, type: 'boolean' };
        case 'cell_ref':
            return { value: ctx.getCellValue(node.col, node.row), type: ctx.getCellType(node.col, node.row) };
        case 'external_cell_ref': {
            if (!ctx.resolveExternalCellValue || !ctx.resolveExternalCellType)
                throw new Error('Cross-table references not supported in this context');
            return {
                value: ctx.resolveExternalCellValue(node.canvasName, node.tableName, node.col, node.row),
                type: ctx.resolveExternalCellType(node.canvasName, node.tableName, node.col, node.row),
            };
        }
        case 'range':
            throw new Error('Range can only be used as a function argument');
        case 'external_range':
            throw new Error('External range can only be used as a function argument');

        case 'unary': {
            const operand = evaluate(node.operand, ctx);
            // Propagate error values
            if (typeof operand.value === 'string' && operand.value.startsWith('#')) return operand;
            if (node.op === '-') {
                return { value: -toNumber(operand.value), type: operand.type };
            }
            return operand;
        }

        case 'binary': {
            if (node.op === '&') {
                const lConcat = evaluateVal(node.left, ctx);
                const rConcat = evaluateVal(node.right, ctx);
                // Propagate errors through concatenation
                if (typeof lConcat === 'string' && lConcat.startsWith('#')) return { value: lConcat, type: 'text' };
                if (typeof rConcat === 'string' && rConcat.startsWith('#')) return { value: rConcat, type: 'text' };
                return {
                    value: String(lConcat ?? '') + String(rConcat ?? ''),
                    type: 'text',
                };
            }
            const l = evaluate(node.left, ctx);
            const r = evaluate(node.right, ctx);

            // Propagate error values (e.g. #REF!, #CIRCULAR!, #ERROR!)
            if (typeof l.value === 'string' && l.value.startsWith('#')) return l;
            if (typeof r.value === 'string' && r.value.startsWith('#')) return r;

            // Comparison operators
            if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
                switch (node.op) {
                    case '=':
                        return { value: l.value === r.value, type: 'boolean' };
                    case '<>':
                        return { value: l.value !== r.value, type: 'boolean' };
                    case '<':
                        return { value: toNumber(l.value) < toNumber(r.value), type: 'boolean' };
                    case '>':
                        return { value: toNumber(l.value) > toNumber(r.value), type: 'boolean' };
                    case '<=':
                        return { value: toNumber(l.value) <= toNumber(r.value), type: 'boolean' };
                    case '>=':
                        return { value: toNumber(l.value) >= toNumber(r.value), type: 'boolean' };
                }
            }

            // Arithmetic: check type compatibility
            const resolvedType = resolveType(l.type, r.type);

            // Text in arithmetic → #N/A
            if (resolvedType === null) {
                // One is text and the other is numeric
                if (
                    (l.type === 'text' && l.value !== null && l.value !== '') ||
                    (r.type === 'text' && r.value !== null && r.value !== '')
                ) {
                    return { value: '#N/A', type: 'text' };
                }
                // Both empty or compatible, fall through
            }

            const lNum = toNumber(l.value);
            const rNum = toNumber(r.value);

            switch (node.op) {
                case '+':
                    return { value: lNum + rNum, type: resolvedType ?? 'float' };
                case '-':
                    return { value: lNum - rNum, type: resolvedType ?? 'float' };
                case '*': {
                    // Multiplying currency by integer/float keeps currency
                    const multType =
                        isNumericType(l.type) && (r.type === 'integer' || r.type === 'float')
                            ? l.type
                            : isNumericType(r.type) && (l.type === 'integer' || l.type === 'float')
                              ? r.type
                              : (resolvedType ?? 'float');
                    return { value: lNum * rNum, type: multType };
                }
                case '/': {
                    if (rNum === 0) return { value: '#DIV/0!', type: 'text' };
                    // Dividing currency by number keeps currency; currency / currency → float
                    let divType = resolvedType ?? 'float';
                    if (
                        (l.type === 'currency_eur' || l.type === 'currency_usd') &&
                        (r.type === 'currency_eur' || r.type === 'currency_usd')
                    ) {
                        divType = 'float'; // currency / currency = ratio
                    }
                    return { value: lNum / rNum, type: divType };
                }
                case '^':
                    return { value: Math.pow(lNum, rNum), type: 'float' };
                default:
                    return { value: '#OP!', type: 'text' };
            }
        }

        case 'function':
            return evalFunction(node.name, node.args, ctx);
    }
}

/** Convenience: evaluate and return just the value (for backward compat) */
export function evaluateVal(node: ASTNode, ctx: FormulaContext): CellValue {
    return evaluate(node, ctx).value;
}
