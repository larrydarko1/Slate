// parser — recursive-descent parser for the Slate formula language.
// Owns: ASTNode, parseCellRef, Parser class.
// Does NOT own: tokenization (tokenizer.ts), evaluation (evaluator.ts).

import type { Token, TokenType } from './tokenizer';
import { columnLetterToIndex } from '../../../types/spreadsheet';

// ── AST ──────────────────────────────────────────────────────────────────────

export type ASTNode =
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'cell_ref'; col: number; row: number }
    | { type: 'range'; sc: number; sr: number; ec: number; er: number }
    | { type: 'external_cell_ref'; canvasName: string | null; tableName: string; col: number; row: number }
    | {
          type: 'external_range';
          canvasName: string | null;
          tableName: string;
          sc: number;
          sr: number;
          ec: number;
          er: number;
      }
    | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
    | { type: 'unary'; op: string; operand: ASTNode }
    | { type: 'function'; name: string; args: ASTNode[] };

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseCellRef(ref: string): { col: number; row: number } {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) throw new Error(`Invalid cell reference: ${ref}`);
    return { col: columnLetterToIndex(m[1]), row: parseInt(m[2]) - 1 };
}

// ── Parser (recursive-descent) ───────────────────────────────────────────────

export class Parser {
    private tokens: Token[];
    private pos = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    private peek(): Token {
        return this.tokens[this.pos];
    }
    private advance(): Token {
        return this.tokens[this.pos++];
    }
    private expect(t: TokenType): Token {
        const tok = this.advance();
        if (tok.type !== t) throw new Error(`Expected ${t}, got ${tok.type}`);
        return tok;
    }

    parse(): ASTNode {
        const node = this.expr();
        this.expect('EOF');
        return node;
    }

    private expr(): ASTNode {
        return this.concat();
    }

    private concat(): ASTNode {
        let left = this.comparison();
        while (this.peek().type === 'AMP') {
            this.advance();
            left = { type: 'binary', op: '&', left, right: this.comparison() };
        }
        return left;
    }

    private comparison(): ASTNode {
        let left = this.addition();
        const cmp: TokenType[] = ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE'];
        while (cmp.includes(this.peek().type)) {
            const op = this.advance().value;
            left = { type: 'binary', op, left, right: this.addition() };
        }
        return left;
    }

    private addition(): ASTNode {
        let left = this.multiplication();
        while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
            const op = this.advance().value;
            left = { type: 'binary', op, left, right: this.multiplication() };
        }
        return left;
    }

    private multiplication(): ASTNode {
        let left = this.power();
        while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
            const op = this.advance().value;
            left = { type: 'binary', op, left, right: this.power() };
        }
        return left;
    }

    private power(): ASTNode {
        let left = this.unary();
        while (this.peek().type === 'CARET') {
            this.advance();
            left = { type: 'binary', op: '^', left, right: this.unary() };
        }
        return left;
    }

    private unary(): ASTNode {
        if (this.peek().type === 'MINUS') {
            this.advance();
            return { type: 'unary', op: '-', operand: this.unary() };
        }
        if (this.peek().type === 'PLUS') {
            this.advance();
            return this.unary();
        }
        return this.primary();
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
        this.expect('DOUBLE_COLON');
        const next = this.peek();

        // Determine if this is canvas::table::ref or table::ref
        if (next.type === 'QUOTED_NAME' || next.type === 'IDENTIFIER' || next.type === 'CELL_REF') {
            this.advance();
            const secondName = next.value;

            if (this.peek().type === 'DOUBLE_COLON') {
                // canvas :: table :: cellref
                this.advance(); // consume ::
                const canvasName = firstName;
                const tableName = secondName;
                return this.parseCellOrRange(canvasName, tableName);
            }

            // table :: cellref
            // secondName should be a CELL_REF
            if (next.type === 'CELL_REF') {
                const { col, row } = parseCellRef(secondName);
                if (this.peek().type === 'COLON') {
                    this.advance();
                    const end = parseCellRef(this.expect('CELL_REF').value);
                    return {
                        type: 'external_range',
                        canvasName: null,
                        tableName: firstName,
                        sc: col,
                        sr: row,
                        ec: end.col,
                        er: end.row,
                    };
                }
                return { type: 'external_cell_ref', canvasName: null, tableName: firstName, col, row };
            }

            // secondName is an IDENTIFIER/QUOTED_NAME but no :: follows → error
            throw new Error(`Expected :: or cell reference after '${secondName}'`);
        }

        throw new Error(`Expected table name or cell reference after ::`);
    }

    /** Parse a CELL_REF (or CELL_REF:CELL_REF range) in an external context */
    private parseCellOrRange(canvasName: string | null, tableName: string): ASTNode {
        const refTok = this.expect('CELL_REF');
        const { col, row } = parseCellRef(refTok.value);
        if (this.peek().type === 'COLON') {
            this.advance();
            const end = parseCellRef(this.expect('CELL_REF').value);
            return { type: 'external_range', canvasName, tableName, sc: col, sr: row, ec: end.col, er: end.row };
        }
        return { type: 'external_cell_ref', canvasName, tableName, col, row };
    }

    private primary(): ASTNode {
        const tok = this.peek();

        switch (tok.type) {
            case 'NUMBER':
                this.advance();
                return { type: 'number', value: tok.num! };

            case 'STRING':
                this.advance();
                return { type: 'string', value: tok.value };

            case 'BOOLEAN':
                this.advance();
                return { type: 'boolean', value: tok.value === 'TRUE' };

            case 'CELL_REF': {
                this.advance();
                // Check if this CELL_REF-looking token is actually a table name
                // followed by :: (e.g. Table1::A1)
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(tok.value);
                }
                const { col, row } = parseCellRef(tok.value);
                if (this.peek().type === 'COLON') {
                    this.advance();
                    const end = parseCellRef(this.expect('CELL_REF').value);
                    return { type: 'range', sc: col, sr: row, ec: end.col, er: end.row };
                }
                return { type: 'cell_ref', col, row };
            }

            case 'QUOTED_NAME': {
                this.advance();
                // Must be followed by :: for a cross-table/cross-canvas reference
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(tok.value);
                }
                throw new Error(`Unexpected quoted name: '${tok.value}' (expected ::)`);
            }

            case 'IDENTIFIER': {
                this.advance();
                const name = tok.value;
                // Check if this is a table name prefix (e.g. Sales::A1)
                if (this.peek().type === 'DOUBLE_COLON') {
                    return this.parseExternalRef(name);
                }
                this.expect('LPAREN');
                const args: ASTNode[] = [];
                if (this.peek().type !== 'RPAREN') {
                    args.push(this.expr());
                    while (this.peek().type === 'COMMA') {
                        this.advance();
                        args.push(this.expr());
                    }
                }
                this.expect('RPAREN');
                return { type: 'function', name, args };
            }

            case 'LPAREN': {
                this.advance();
                const inner = this.expr();
                this.expect('RPAREN');
                return inner;
            }

            default:
                throw new Error(`Unexpected token: ${tok.type} "${tok.value}"`);
        }
    }
}
