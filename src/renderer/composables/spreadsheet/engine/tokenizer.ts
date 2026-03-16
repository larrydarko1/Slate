// tokenizer — lexer for the Slate formula language.
// Owns: TokenType, Token, tokenize().
// Does NOT own: parsing (parser.ts), evaluation (evaluator.ts).

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

export interface Token {
    type: TokenType;
    value: string;
    num?: number;
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

export function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < src.length) {
        // whitespace
        if (/\s/.test(src[i])) {
            i++;
            continue;
        }

        // number
        if (/\d/.test(src[i])) {
            let n = '';
            while (i < src.length && /[\d.]/.test(src[i])) n += src[i++];
            tokens.push({ type: 'NUMBER', value: n, num: parseFloat(n) });
            continue;
        }

        // string
        if (src[i] === '"') {
            i++;
            let s = '';
            while (i < src.length && src[i] !== '"') s += src[i++];
            i++; // closing "
            tokens.push({ type: 'STRING', value: s });
            continue;
        }

        // single-quoted name (for table/canvas references like 'Table 1')
        if (src[i] === "'") {
            i++;
            let s = '';
            while (i < src.length && src[i] !== "'") s += src[i++];
            i++; // closing '
            tokens.push({ type: 'QUOTED_NAME', value: s });
            continue;
        }

        // word (cell ref, identifier, boolean)
        if (/[A-Za-z_]/.test(src[i])) {
            let w = '';
            while (i < src.length && /[A-Za-z_]/.test(src[i])) w += src[i++];
            const up = w.toUpperCase();

            if (up === 'TRUE' || up === 'FALSE') {
                tokens.push({ type: 'BOOLEAN', value: up });
                continue;
            }

            // If followed by digits → cell reference (e.g. AB23)
            if (i < src.length && /\d/.test(src[i])) {
                let digits = '';
                while (i < src.length && /\d/.test(src[i])) digits += src[i++];
                tokens.push({ type: 'CELL_REF', value: up + digits });
                continue;
            }

            tokens.push({ type: 'IDENTIFIER', value: up });
            continue;
        }

        // operators & punctuation
        const c = src[i];
        switch (c) {
            case '+':
                tokens.push({ type: 'PLUS', value: c });
                break;
            case '-':
                tokens.push({ type: 'MINUS', value: c });
                break;
            case '*':
                tokens.push({ type: 'STAR', value: c });
                break;
            case '/':
                tokens.push({ type: 'SLASH', value: c });
                break;
            case '^':
                tokens.push({ type: 'CARET', value: c });
                break;
            case '&':
                tokens.push({ type: 'AMP', value: c });
                break;
            case '(':
                tokens.push({ type: 'LPAREN', value: c });
                break;
            case ')':
                tokens.push({ type: 'RPAREN', value: c });
                break;
            case ',':
                tokens.push({ type: 'COMMA', value: c });
                break;
            case ':':
                if (src[i + 1] === ':') {
                    tokens.push({ type: 'DOUBLE_COLON', value: '::' });
                    i++; // skip second colon
                } else {
                    tokens.push({ type: 'COLON', value: c });
                }
                break;
            case '=':
                tokens.push({ type: 'EQ', value: c });
                break;
            case '<':
                if (src[i + 1] === '>') {
                    tokens.push({ type: 'NEQ', value: '<>' });
                    i++;
                } else if (src[i + 1] === '=') {
                    tokens.push({ type: 'LTE', value: '<=' });
                    i++;
                } else tokens.push({ type: 'LT', value: '<' });
                break;
            case '>':
                if (src[i + 1] === '=') {
                    tokens.push({ type: 'GTE', value: '>=' });
                    i++;
                } else tokens.push({ type: 'GT', value: '>' });
                break;
            default:
                throw new Error(`Unexpected character: ${c}`);
        }
        i++;
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
}
