/**
 * evaluator — type-aware AST evaluator for the Slate formula engine.
 * Owns: evaluate, evaluateVal, evalFunction, type coercion helpers.
 *  Does NOT own: tokenization (tokenizer.ts), parsing (parser.ts), public API (formula.ts).
 */

import type { CellValue } from '@/renderer/types/spreadsheet';
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { resolveType, resolveTypeList, isNumericType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import type { ASTNode } from '@/renderer/composables/spreadsheet/engine/parser';

// ── Type helpers ─────────────────────────────────────────────────────────────

export type TypedCellValue = {
    value: CellValue;
    type: CellDataType;
};

export function toNumber(v: CellValue): number {
    if (v === null || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    const parsed = Number(v);
    return isNaN(parsed) ? 0 : parsed;
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
            if (ctx.resolveExternalCellValue === undefined || ctx.resolveExternalCellType === undefined)
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
            const left = evaluate(node.left, ctx);
            const right = evaluate(node.right, ctx);

            // Propagate error values (e.g. #REF!, #CIRCULAR!, #ERROR!)
            if (typeof left.value === 'string' && left.value.startsWith('#')) return left;
            if (typeof right.value === 'string' && right.value.startsWith('#')) return right;

            // Comparison operators
            if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
                switch (node.op) {
                    case '=':
                        return { value: left.value === right.value, type: 'boolean' };
                    case '<>':
                        return { value: left.value !== right.value, type: 'boolean' };
                    case '<':
                        return { value: toNumber(left.value) < toNumber(right.value), type: 'boolean' };
                    case '>':
                        return { value: toNumber(left.value) > toNumber(right.value), type: 'boolean' };
                    case '<=':
                        return { value: toNumber(left.value) <= toNumber(right.value), type: 'boolean' };
                    case '>=':
                        return { value: toNumber(left.value) >= toNumber(right.value), type: 'boolean' };
                }
            }

            // Arithmetic: check type compatibility
            const resolvedType = resolveType(left.type, right.type);

            // Text in arithmetic → #N/A
            if (resolvedType === null) {
                // One is text and the other is numeric
                if (
                    (left.type === 'text' && left.value !== null && left.value !== '') ||
                    (right.type === 'text' && right.value !== null && right.value !== '')
                ) {
                    return { value: '#N/A', type: 'text' };
                }
                // Both empty or compatible, fall through
            }

            const lNum = toNumber(left.value);
            const rNum = toNumber(right.value);

            switch (node.op) {
                case '+':
                    return { value: lNum + rNum, type: resolvedType ?? 'float' };
                case '-':
                    return { value: lNum - rNum, type: resolvedType ?? 'float' };
                case '*': {
                    // Multiplying currency by a plain integer/float keeps the currency —
                    // whichever side carries it. Neither side carrying it falls through to
                    // the type both operands agreed on.
                    const scalesLeft = isNumericType(left.type) && (right.type === 'integer' || right.type === 'float');
                    const scalesRight = isNumericType(right.type) && (left.type === 'integer' || left.type === 'float');
                    let multType: CellDataType;
                    if (scalesLeft) multType = left.type;
                    else if (scalesRight) multType = right.type;
                    else multType = resolvedType ?? 'float';
                    return { value: lNum * rNum, type: multType };
                }
                case '/': {
                    if (rNum === 0) return { value: '#DIV/0!', type: 'text' };
                    // Dividing currency by number keeps currency; currency / currency → float
                    let divType = resolvedType ?? 'float';
                    if (
                        (left.type === 'currency_eur' || left.type === 'currency_usd') &&
                        (right.type === 'currency_eur' || right.type === 'currency_usd')
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

// ── Argument flattening ──────────────────────────────────────────────────────

/**
 * Spreadsheet truthiness: a blank cell, `0`, an empty string and `FALSE` all
 * read as false, which is what `IF`, `AND`, `OR` and `NOT` expect.
 */
function isTruthy(v: CellValue): boolean {
    if (v === null || v === false) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v !== '';
    return true;
}

function flattenArgs(args: ASTNode[], ctx: FormulaContext): CellValue[] {
    const out: CellValue[] = [];
    for (const arg of args) {
        if (arg.type === 'range') {
            out.push(...ctx.getCellRange(arg.sc, arg.sr, arg.ec, arg.er));
        } else if (arg.type === 'external_range') {
            if (ctx.resolveExternalCellRange === undefined)
                throw new Error('Cross-table references not supported in this context');
            out.push(...ctx.resolveExternalCellRange(arg.canvasName, arg.tableName, arg.sc, arg.sr, arg.ec, arg.er));
        } else {
            out.push(evaluateVal(arg, ctx));
        }
    }
    return out;
}

function flattenTypedArgs(args: ASTNode[], ctx: FormulaContext): TypedCellValue[] {
    const out: TypedCellValue[] = [];
    for (const arg of args) {
        if (arg.type === 'range') {
            const vals = ctx.getCellRange(arg.sc, arg.sr, arg.ec, arg.er);
            const types = ctx.getCellRangeTypes(arg.sc, arg.sr, arg.ec, arg.er);
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' });
            }
        } else if (arg.type === 'external_range') {
            if (ctx.resolveExternalCellRange === undefined || ctx.resolveExternalCellRangeTypes === undefined)
                throw new Error('Cross-table references not supported in this context');
            const vals = ctx.resolveExternalCellRange(arg.canvasName, arg.tableName, arg.sc, arg.sr, arg.ec, arg.er);
            const types = ctx.resolveExternalCellRangeTypes(
                arg.canvasName,
                arg.tableName,
                arg.sc,
                arg.sr,
                arg.ec,
                arg.er,
            );
            for (let i = 0; i < vals.length; i++) {
                out.push({ value: vals[i], type: types[i] ?? 'empty' });
            }
        } else {
            const result = evaluate(arg, ctx);
            out.push(result);
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
    for (const entry of vals) {
        if (entry.value === null || entry.value === '' || entry.type === 'text') continue;
        const num = toNumber(entry.value);
        nums.push(num);
        types.push(entry.type);
    }
    return { nums, types };
}

// ── Function dispatch ────────────────────────────────────────────────────────

function evalFunction(name: string, args: ASTNode[], ctx: FormulaContext): TypedCellValue {
    switch (name) {
        case 'SUM': {
            const typed = flattenTypedArgs(args, ctx);
            const errCell = typed.find((v) => typeof v.value === 'string' && v.value.startsWith('#'));
            if (errCell !== undefined) return errCell;
            const { nums, types } = numericTypedValues(typed);
            const hasText = typed.some((v) => v.type === 'text' && v.value !== null && v.value !== '');
            if (hasText) return { value: '#N/A', type: 'text' };
            const resultType = resolveTypeList(types) ?? 'float';
            return { value: nums.reduce((a, b) => a + b, 0), type: resultType };
        }
        case 'AVERAGE': {
            const typed = flattenTypedArgs(args, ctx);
            const errCellAvg = typed.find((v) => typeof v.value === 'string' && v.value.startsWith('#'));
            if (errCellAvg !== undefined) return errCellAvg;
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
            const errMin = typed.find((v) => typeof v.value === 'string' && v.value.startsWith('#'));
            if (errMin !== undefined) return errMin;
            const { nums, types } = numericTypedValues(typed);
            const resultType = resolveTypeList(types) ?? 'integer';
            return { value: nums.length > 0 ? Math.min(...nums) : 0, type: resultType };
        }
        case 'MAX': {
            const typed = flattenTypedArgs(args, ctx);
            const errMax = typed.find((v) => typeof v.value === 'string' && v.value.startsWith('#'));
            if (errMax !== undefined) return errMax;
            const { nums, types } = numericTypedValues(typed);
            const resultType = resolveTypeList(types) ?? 'integer';
            return { value: nums.length > 0 ? Math.max(...nums) : 0, type: resultType };
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
            const factor = Math.pow(10, digits);
            const rounded = Math.round(val * factor) / factor;
            // A rounded value keeps its own numeric type. When it has none, the digit
            // count decides: rounding to 0 places yields a whole number, anything else
            // keeps a fractional part.
            const fallbackType = digits === 0 ? 'integer' : 'float';
            const resultType = isNumericType(valR.type) ? valR.type : fallbackType;
            return { value: rounded, type: resultType === 'integer' && digits > 0 ? 'float' : resultType };
        }
        case 'ABS': {
            const valA = evaluate(args[0], ctx);
            return { value: Math.abs(toNumber(valA.value)), type: isNumericType(valA.type) ? valA.type : 'float' };
        }
        case 'SQRT': {
            const valS = evaluate(args[0], ctx);
            const num = toNumber(valS.value);
            return { value: num < 0 ? '#NUM!' : Math.sqrt(num), type: num < 0 ? 'text' : 'float' };
        }
        case 'POWER': {
            const base = evaluate(args[0], ctx);
            return { value: Math.pow(toNumber(base.value), toNumber(evaluateVal(args[1], ctx))), type: 'float' };
        }
        case 'MOD': {
            const left = toNumber(evaluateVal(args[0], ctx));
            const right = toNumber(evaluateVal(args[1], ctx));
            return { value: right === 0 ? '#DIV/0!' : left % right, type: right === 0 ? 'text' : 'integer' };
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
            const truthy = isTruthy(cond) && cond !== '#ERROR!';
            return evaluate(truthy ? args[1] : (args[2] ?? { type: 'boolean', value: false }), ctx);
        }
        case 'AND': {
            const vals = flattenArgs(args, ctx);
            return { value: vals.every(isTruthy), type: 'boolean' };
        }
        case 'OR': {
            const vals = flattenArgs(args, ctx);
            return { value: vals.some(isTruthy), type: 'boolean' };
        }
        case 'NOT':
            return { value: !isTruthy(evaluateVal(args[0], ctx)), type: 'boolean' };

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
            const text = String(evaluateVal(args[0], ctx) ?? '');
            const count = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: text.substring(0, count), type: 'text' };
        }
        case 'RIGHT': {
            const text = String(evaluateVal(args[0], ctx) ?? '');
            const count = args.length > 1 ? toNumber(evaluateVal(args[1], ctx)) : 1;
            return { value: text.substring(text.length - count), type: 'text' };
        }
        case 'MID': {
            const text = String(evaluateVal(args[0], ctx) ?? '');
            const start = toNumber(evaluateVal(args[1], ctx)) - 1;
            const len = toNumber(evaluateVal(args[2], ctx));
            return { value: text.substring(start, start + len), type: 'text' };
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
