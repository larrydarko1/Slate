/**
 * operators — the binary operators of the formula language, applied to two
 * operands that are already evaluated, so every rule here is a pure function
 * of the two typed values.
 * Owns: comparison and arithmetic operators, the result type each one gives, number coercion.
 * Does NOT own: `&` concatenation and evaluating the operands (evaluator.ts).
 */
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { isNumericType, resolveType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { CellValue } from '@/renderer/types/spreadsheet';

export type TypedCellValue = {
    value: CellValue;
    type: CellDataType;
};

export function applyOperator(op: string, left: TypedCellValue, right: TypedCellValue): TypedCellValue {
    // Propagate error values (e.g. #REF!, #CIRCULAR!, #ERROR!)
    if (typeof left.value === 'string' && left.value.startsWith('#')) return left;
    if (typeof right.value === 'string' && right.value.startsWith('#')) return right;

    // Comparison operators
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
        switch (op) {
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

    switch (op) {
        case '+':
            return { value: lNum + rNum, type: resolvedType ?? 'float' };
        case '-':
            // Two dates apart is a number of days, not a date.
            if (left.type === 'date' && right.type === 'date') return { value: lNum - rNum, type: 'integer' };
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

/** Coerce to a number. Reached only after the type layer has approved the operation. */
export function toNumber(v: CellValue): number {
    if (v === null || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    const parsed = Number(v);
    return isNaN(parsed) ? 0 : parsed;
}
