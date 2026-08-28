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

export type Token = {
    type: TokenType;
    value: string;
    num?: number;
};

// ── Tokenizer ────────────────────────────────────────────────────────────────

export function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;

    /** Consumes the run of digits at `pos`, if any, and returns it. */
    function takeDigits(): string {
        let digits = '';
        while (pos < src.length && /\d/.test(src[pos])) digits += src[pos++];
        return digits;
    }

    while (pos < src.length) {
        // whitespace
        if (/\s/.test(src[pos])) {
            pos++;
            continue;
        }

        // number
        if (/\d/.test(src[pos])) {
            let digits = '';
            while (pos < src.length && /[\d.]/.test(src[pos])) digits += src[pos++];
            tokens.push({ type: 'NUMBER', value: digits, num: parseFloat(digits) });
            continue;
        }

        // string
        if (src[pos] === '"') {
            pos++;
            let text = '';
            while (pos < src.length && src[pos] !== '"') text += src[pos++];
            pos++; // closing "
            tokens.push({ type: 'STRING', value: text });
            continue;
        }

        // single-quoted name (for table/canvas references like 'Table 1')
        if (src[pos] === "'") {
            pos++;
            let quoted = '';
            while (pos < src.length && src[pos] !== "'") quoted += src[pos++];
            pos++; // closing '
            tokens.push({ type: 'QUOTED_NAME', value: quoted });
            continue;
        }

        // word (cell ref, identifier, boolean)
        if (/[A-Za-z_]/.test(src[pos])) {
            let word = '';
            while (pos < src.length && /[A-Za-z_]/.test(src[pos])) word += src[pos++];
            const up = word.toUpperCase();

            if (up === 'TRUE' || up === 'FALSE') {
                tokens.push({ type: 'BOOLEAN', value: up });
                continue;
            }

            // If followed by digits → cell reference (e.g. AB23)
            const digits = takeDigits();
            if (digits !== '') {
                tokens.push({ type: 'CELL_REF', value: up + digits });
                continue;
            }

            tokens.push({ type: 'IDENTIFIER', value: up });
            continue;
        }

        // operators & punctuation
        const char = src[pos];
        switch (char) {
            case '+':
                tokens.push({ type: 'PLUS', value: char });
                break;
            case '-':
                tokens.push({ type: 'MINUS', value: char });
                break;
            case '*':
                tokens.push({ type: 'STAR', value: char });
                break;
            case '/':
                tokens.push({ type: 'SLASH', value: char });
                break;
            case '^':
                tokens.push({ type: 'CARET', value: char });
                break;
            case '&':
                tokens.push({ type: 'AMP', value: char });
                break;
            case '(':
                tokens.push({ type: 'LPAREN', value: char });
                break;
            case ')':
                tokens.push({ type: 'RPAREN', value: char });
                break;
            case ',':
                tokens.push({ type: 'COMMA', value: char });
                break;
            case ':':
                if (src[pos + 1] === ':') {
                    tokens.push({ type: 'DOUBLE_COLON', value: '::' });
                    pos++; // skip second colon
                } else {
                    tokens.push({ type: 'COLON', value: char });
                }
                break;
            case '=':
                tokens.push({ type: 'EQ', value: char });
                break;
            case '<':
                if (src[pos + 1] === '>') {
                    tokens.push({ type: 'NEQ', value: '<>' });
                    pos++;
                } else if (src[pos + 1] === '=') {
                    tokens.push({ type: 'LTE', value: '<=' });
                    pos++;
                } else tokens.push({ type: 'LT', value: '<' });
                break;
            case '>':
                if (src[pos + 1] === '=') {
                    tokens.push({ type: 'GTE', value: '>=' });
                    pos++;
                } else tokens.push({ type: 'GT', value: '>' });
                break;
            default:
                throw new Error(`Unexpected character: ${char}`);
        }
        pos++;
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
}
