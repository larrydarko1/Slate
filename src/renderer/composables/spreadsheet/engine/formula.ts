// formula — public API for the Slate formula engine.
// Owns: FormulaContext, TypedResult, evaluateFormula, evaluateFormulaTyped.
// Does NOT own: tokenization (tokenizer.ts), parsing (parser.ts), evaluation (evaluator.ts).

/**
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

import type { CellValue } from '../../../types/spreadsheet';
import type { CellDataType } from './cellTypes';
import { tokenize } from './tokenizer';
import { Parser } from './parser';
import { evaluate } from './evaluator';

// Re-export AST node type for consumers that need it
export type { ASTNode } from './parser';

// ── Public context the evaluator needs ───────────────────────────────────────

export interface FormulaContext {
    getCellValue: (col: number, row: number) => CellValue;
    getCellType: (col: number, row: number) => CellDataType;
    getCellRange: (startCol: number, startRow: number, endCol: number, endRow: number) => CellValue[];
    getCellRangeTypes: (startCol: number, startRow: number, endCol: number, endRow: number) => CellDataType[];
    // Cross-table / cross-canvas resolution (optional – only provided by the composable)
    resolveExternalCellValue?: (canvasName: string | null, tableName: string, col: number, row: number) => CellValue;
    resolveExternalCellType?: (canvasName: string | null, tableName: string, col: number, row: number) => CellDataType;
    resolveExternalCellRange?: (
        canvasName: string | null,
        tableName: string,
        sc: number,
        sr: number,
        ec: number,
        er: number,
    ) => CellValue[];
    resolveExternalCellRangeTypes?: (
        canvasName: string | null,
        tableName: string,
        sc: number,
        sr: number,
        ec: number,
        er: number,
    ) => CellDataType[];
}

/** Result of a type-aware formula evaluation */
export interface TypedResult {
    value: CellValue;
    type: CellDataType;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function evaluateFormula(formulaBody: string, ctx: FormulaContext): CellValue {
    try {
        const tokens = tokenize(formulaBody);
        const ast = new Parser(tokens).parse();
        return evaluate(ast, ctx).value;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return `#ERROR! ${msg}`;
    }
}

/** Type-aware formula evaluation — returns both value and resolved type */
export function evaluateFormulaTyped(formulaBody: string, ctx: FormulaContext): TypedResult {
    try {
        const tokens = tokenize(formulaBody);
        const ast = new Parser(tokens).parse();
        const result = evaluate(ast, ctx);
        return { value: result.value, type: result.type };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { value: `#ERROR! ${msg}`, type: 'text' };
    }
}
