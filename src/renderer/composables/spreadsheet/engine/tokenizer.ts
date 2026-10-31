/**
 * tokenizer — lexer for the Slate formula language.
 * Owns: TokenType, Token, tokenize().
 * Does NOT own: parsing (parser.ts), evaluation (evaluator.ts).
 */

// ── Token types ──────────────────────────────────────────────────────────────

export type TokenType =
    | 'NUMBER'
    | 'STRING'
    | 'BOOLEAN'
    | 'CELL_REF'
    | 'IDENTIFIER'
    | 'QUOTED_NAME'
    | 'PLUS'
    | 'MINUS'
    | 'STAR'
    | 'SLASH'
    | 'CARET'
    | 'AMP'
    | 'EQ'
    | 'NEQ'
    | 'LT'
    | 'GT'
    | 'LTE'
    | 'GTE'
    | 'LPAREN'
    | 'RPAREN'
    | 'COMMA'
    | 'COLON'
    | 'DOUBLE_COLON'
    | 'EOF';

/** `start` and `end` are the token's offsets in the source, end exclusive. */
export type Token = {
    type: TokenType;
    value: string;
    num?: number;
    start: number;
    end: number;
};

// ── Tokenizer ────────────────────────────────────────────────────────────────

export function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;

    /**
     * The character at `i`, or '' once past the end. Every test below is a
     * character class, and '' matches none of them — so the end of input falls
     * out of each loop on its own, the way the explicit bounds checks intend.
     */
    const at = (i: number): string => src[i] ?? '';

    /** Consumes the run of digits at `pos`, if any, and returns it. */
    function takeDigits(): string {
        let digits = '';
        while (pos < src.length && /\d/.test(at(pos))) digits += at(pos++);
        return digits;
    }

    /**
     * Consumes one token starting at `pos`, or nothing for whitespace. The
     * caller stamps the token with where it started and ended.
     */
    function next(): Omit<Token, 'start' | 'end'> | null {
        // whitespace
        if (/\s/.test(at(pos))) {
            pos++;
            return null;
        }

        // number
        if (/\d/.test(at(pos))) {
            let digits = '';
            while (pos < src.length && /[\d.]/.test(at(pos))) digits += at(pos++);
            return { type: 'NUMBER', value: digits, num: parseFloat(digits) };
        }

        // string
        if (at(pos) === '"') {
            pos++;
            let text = '';
            while (pos < src.length && at(pos) !== '"') text += at(pos++);
            pos++; // closing "
            return { type: 'STRING', value: text };
        }

        // single-quoted name (for table/canvas references like 'Table 1')
        if (at(pos) === "'") {
            pos++;
            let quoted = '';
            while (pos < src.length && at(pos) !== "'") quoted += at(pos++);
            pos++; // closing '
            return { type: 'QUOTED_NAME', value: quoted };
        }

        // word (cell ref, identifier, boolean)
        if (/[A-Za-z_]/.test(at(pos))) {
            let word = '';
            while (pos < src.length && /[A-Za-z_]/.test(at(pos))) word += at(pos++);
            const up = word.toUpperCase();

            if (up === 'TRUE' || up === 'FALSE') return { type: 'BOOLEAN', value: up };

            // If followed by digits → cell reference (e.g. AB23)
            const digits = takeDigits();
            if (digits !== '') return { type: 'CELL_REF', value: up + digits };

            return { type: 'IDENTIFIER', value: up };
        }

        // operators & punctuation
        const char = at(pos++);
        switch (char) {
            case '+':
                return { type: 'PLUS', value: char };
            case '-':
                return { type: 'MINUS', value: char };
            case '*':
                return { type: 'STAR', value: char };
            case '/':
                return { type: 'SLASH', value: char };
            case '^':
                return { type: 'CARET', value: char };
            case '&':
                return { type: 'AMP', value: char };
            case '(':
                return { type: 'LPAREN', value: char };
            case ')':
                return { type: 'RPAREN', value: char };
            case ',':
                return { type: 'COMMA', value: char };
            case ':':
                if (at(pos) === ':') {
                    pos++;
                    return { type: 'DOUBLE_COLON', value: '::' };
                }
                return { type: 'COLON', value: char };
            case '=':
                return { type: 'EQ', value: char };
            case '<':
                if (at(pos) === '>') {
                    pos++;
                    return { type: 'NEQ', value: '<>' };
                }
                if (at(pos) === '=') {
                    pos++;
                    return { type: 'LTE', value: '<=' };
                }
                return { type: 'LT', value: '<' };
            case '>':
                if (at(pos) === '=') {
                    pos++;
                    return { type: 'GTE', value: '>=' };
                }
                return { type: 'GT', value: '>' };
            default:
                throw new Error(`Unexpected character: ${char}`);
        }
    }

    while (pos < src.length) {
        const start = pos;
        const token = next();
        // An unclosed string or name steps past the end; its span stops there.
        if (token !== null) tokens.push({ ...token, start, end: Math.min(pos, src.length) });
    }

    tokens.push({ type: 'EOF', value: '', start: src.length, end: src.length });
    return tokens;
}
