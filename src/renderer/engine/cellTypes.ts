/**
 * Cell Type System for Slate
 *
 * Supported types:
 *  - integer:      whole numbers (42, -7, 0)
 *  - float:        decimal numbers (3.14, -0.5)
 *  - percent:      percentage values (50%, stored as 0.5)
 *  - currency_eur: Euro values (€12.50, 12,50€, €1.234,56)
 *  - currency_usd: Dollar values ($12.50, $1,234.56)
 *  - text:         any non-numeric string
 *  - boolean:      true / false
 *  - url:          a URL starting with http:// or https://
 *  - empty:        null / empty cell
 */

// ── Types ──

export type CellDataType =
    | 'integer'
    | 'float'
    | 'percent'
    | 'currency_eur'
    | 'currency_usd'
    | 'text'
    | 'boolean'
    | 'url'
    | 'empty'

export interface TypedValue {
    type: CellDataType
    numericValue: number | null   // underlying number (null for text/empty)
    rawInput: string              // what the user originally typed
}

// ── Detection / Parsing ──

/** Currency regex patterns */
const CURRENCY_USD_PATTERNS = [
    // $1,234.56  or  $1234.56  or  $1234  or  -$12.50
    /^-?\$[\d,]+(?:\.\d+)?$/,
    // 1,234.56$  or  1234.56$
    /^-?[\d,]+(?:\.\d+)?\$$/,
]

/** Matches strings that start with http:// or https:// */
const URL_PATTERN = /^https?:\/\/.+/i

const CURRENCY_EUR_PATTERNS = [
    // €1.234,56  or  €1234,56  or  €1234  or  -€12,50
    // Also handle €12.50 (dot as decimal, no thousands)
    /^-?€[\d.,]+$/,
    // 1.234,56€  or  1234,56€  or  12,50€
    /^-?[\d.,]+€$/,
]

/**
 * Parse a currency string and extract the numeric value.
 */
function parseCurrencyUSD(raw: string): number | null {
    const cleaned = raw.replace(/[$,]/g, '')
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
}

function parseCurrencyEUR(raw: string): number | null {
    // Remove € symbol, then handle European number format
    let cleaned = raw.replace(/€/g, '').trim()

    // Detect European format: dots as thousands, comma as decimal
    // e.g. "1.234,56" → "1234.56"
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned) || /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else if (cleaned.includes(',')) {
        // Simple comma-as-decimal: "12,50" → "12.50"
        cleaned = cleaned.replace(',', '.')
    }

    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
}

/**
 * Detect the type of a raw input string and extract its components.
 */
export function detectType(raw: string): TypedValue {
    if (raw === '' || raw === null || raw === undefined) {
        return { type: 'empty', numericValue: null, rawInput: '' }
    }

    const trimmed = raw.trim()

    // Boolean
    if (trimmed.toLowerCase() === 'true') {
        return { type: 'boolean', numericValue: 1, rawInput: trimmed }
    }
    if (trimmed.toLowerCase() === 'false') {
        return { type: 'boolean', numericValue: 0, rawInput: trimmed }
    }

    // Currency USD
    for (const pat of CURRENCY_USD_PATTERNS) {
        if (pat.test(trimmed)) {
            const num = parseCurrencyUSD(trimmed)
            if (num !== null) {
                return { type: 'currency_usd', numericValue: num, rawInput: trimmed }
            }
        }
    }

    // Currency EUR
    for (const pat of CURRENCY_EUR_PATTERNS) {
        if (pat.test(trimmed)) {
            const num = parseCurrencyEUR(trimmed)
            if (num !== null) {
                return { type: 'currency_eur', numericValue: num, rawInput: trimmed }
            }
        }
    }

    // Percentage (e.g. 50%, 12.5%, -3%)
    if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
        const num = parseFloat(trimmed) / 100
        if (!isNaN(num)) {
            return { type: 'percent', numericValue: num, rawInput: trimmed }
        }
    }

    // Integer (no decimal point, no leading zeros except "0" itself)
    if (/^-?\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10)
        if (!isNaN(n)) {
            return { type: 'integer', numericValue: n, rawInput: trimmed }
        }
    }

    // Float
    if (/^-?\d+\.\d+$/.test(trimmed) || /^-?\.\d+$/.test(trimmed)) {
        const n = parseFloat(trimmed)
        if (!isNaN(n)) {
            return { type: 'float', numericValue: n, rawInput: trimmed }
        }
    }

    // URL (http:// or https://)
    if (URL_PATTERN.test(trimmed)) {
        return { type: 'url', numericValue: null, rawInput: trimmed }
    }

    // Anything else is text
    return { type: 'text', numericValue: null, rawInput: trimmed }
}

// ── Type Hierarchy & Conversion ──

/**
 * Returns true if the type is numeric (can participate in arithmetic).
 */
export function isNumericType(t: CellDataType): boolean {
    return t === 'integer' || t === 'float' || t === 'percent' || t === 'currency_eur' || t === 'currency_usd'
}

/**
 * Returns true if the type is a currency type.
 */
export function isCurrencyType(t: CellDataType): boolean {
    return t === 'currency_eur' || t === 'currency_usd'
}

/**
 * Priority for type coercion (higher = more specific).
 * When two numeric types meet, we promote to the higher-priority one.
 *
 * percent > currency > float > integer
 *
 * The "first cell" rule: the first operand's type is preferred.
 * If both are currency but different, the first one wins.
 */
export const TYPE_PRIORITY: Record<CellDataType, number> = {
    'empty': 0,
    'boolean': 1,
    'integer': 2,
    'float': 3,
    'currency_eur': 4,
    'currency_usd': 4,
    'percent': 5,
    'text': 6,
    'url': 6,
}

/**
 * Resolve the result type when two typed values interact in a formula.
 * - first: the left operand / first cell in chain (has priority)
 * - second: the right operand
 *
 * Returns the resolved CellDataType or null if incompatible (→ #N/A).
 */
export function resolveType(first: CellDataType, second: CellDataType): CellDataType | null {
    // If either is empty, take the other
    if (first === 'empty') return second
    if (second === 'empty') return first

    // Text/URL mixed with numeric → incompatible for arithmetic
    if (first === 'text' || second === 'text' || first === 'url' || second === 'url') return null

    // Both boolean
    if (first === 'boolean' && second === 'boolean') return 'boolean'

    // Boolean + numeric → promote to the numeric type
    if (first === 'boolean') return second
    if (second === 'boolean') return first

    // Both numeric
    if (isNumericType(first) && isNumericType(second)) {
        // Same type → keep it
        if (first === second) return first

        // If one is currency, the first one's currency wins
        if (isCurrencyType(first)) return first
        if (isCurrencyType(second)) return second

        // float vs integer → float
        if (first === 'float' || second === 'float') return 'float'

        return first
    }

    return null
}

/**
 * Resolve the result type for a list of types (e.g. SUM of a range).
 * The first non-empty type in the list sets the "target" type.
 */
export function resolveTypeList(types: CellDataType[]): CellDataType | null {
    let result: CellDataType = 'empty'
    for (const t of types) {
        if (t === 'empty') continue
        if (result === 'empty') {
            result = t
            continue
        }
        const resolved = resolveType(result, t)
        if (resolved === null) return null
        result = resolved
    }
    return result
}

// ── Formatting ──

/**
 * Format a numeric value according to the given cell type.
 */
export function formatValue(value: number | null, type: CellDataType, decimalPlaces?: number): string {
    if (value === null || value === undefined) return ''

    switch (type) {
        case 'integer':
            return Math.round(value).toString()

        case 'float': {
            if (decimalPlaces != null) {
                return value.toFixed(decimalPlaces)
            }
            // Show up to 10 significant decimal places, trim trailing zeros
            if (Number.isInteger(value)) return value.toFixed(1)
            return parseFloat(value.toFixed(10)).toString()
        }

        case 'currency_usd': {
            const dp = decimalPlaces ?? 2
            const abs = Math.abs(value)
            const formatted = abs.toLocaleString('en-US', {
                minimumFractionDigits: dp,
                maximumFractionDigits: dp,
            })
            return value < 0 ? `-$${formatted}` : `$${formatted}`
        }

        case 'currency_eur': {
            const dp = decimalPlaces ?? 2
            const abs = Math.abs(value)
            const formatted = abs.toLocaleString('de-DE', {
                minimumFractionDigits: dp,
                maximumFractionDigits: dp,
            })
            return value < 0 ? `-€${formatted}` : `€${formatted}`
        }

        case 'percent': {
            const pct = value * 100
            if (decimalPlaces != null) {
                return `${pct.toFixed(decimalPlaces)}%`
            }
            if (Number.isInteger(pct) || Math.abs(pct - Math.round(pct)) < 1e-9) {
                return `${Math.round(pct)}%`
            }
            return `${parseFloat(pct.toFixed(10))}%`
        }

        case 'boolean':
            return value ? 'TRUE' : 'FALSE'

        default:
            return value.toString()
    }
}

/**
 * Convert a CellValue + CellDataType into a display string.
 */
export function formatCellDisplay(value: unknown, type: CellDataType, decimalPlaces?: number): string {
    if (value === null || value === undefined) return ''

    if (type === 'text' || type === 'url') return String(value)
    if (type === 'boolean') {
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
        return value ? 'TRUE' : 'FALSE'
    }
    if (type === 'empty') return ''

    if (typeof value === 'number') {
        return formatValue(value, type, decimalPlaces)
    }

    // If it's a string that looks like an error, pass through
    if (typeof value === 'string' && value.startsWith('#')) {
        return value
    }

    return String(value)
}

/**
 * Get the CSS text-align for a cell type.
 */
export function getTypeAlignment(type: CellDataType): 'left' | 'right' | 'center' {
    switch (type) {
        case 'integer':
        case 'float':
        case 'percent':
        case 'currency_eur':
        case 'currency_usd':
            return 'right'
        case 'boolean':
            return 'center'
        case 'text':
        case 'url':
        default:
            return 'left'
    }
}

/**
 * Get a human-readable label for a cell type.
 */
export function getTypeLabel(type: CellDataType): string {
    switch (type) {
        case 'integer': return 'Integer'
        case 'float': return 'Decimal'
        case 'percent': return 'Percent (%)'
        case 'currency_eur': return 'Euro (€)'
        case 'currency_usd': return 'Dollar ($)'
        case 'text': return 'Text'
        case 'boolean': return 'Boolean'
        case 'url': return 'URL'
        case 'empty': return 'Empty'
    }
}

/**
 * Attempt to convert a numeric value to a target type.
 * Returns the formatted display string or '#N/A' on failure.
 */
export function coerceToType(value: unknown, fromType: CellDataType, toType: CellDataType): { numericValue: number | null; display: string } | null {
    // Same type → no conversion needed
    if (fromType === toType) {
        if (typeof value === 'number') {
            return { numericValue: value, display: formatValue(value, toType) }
        }
        return { numericValue: null, display: String(value ?? '') }
    }

    // Text → numeric: attempt parse
    if (fromType === 'text' && isNumericType(toType)) {
        const parsed = parseFloat(String(value))
        if (isNaN(parsed)) return null // → #N/A
        return { numericValue: parsed, display: formatValue(parsed, toType) }
    }

    // Numeric → numeric conversions (always possible)
    if (isNumericType(fromType) && isNumericType(toType)) {
        const num = typeof value === 'number' ? value : parseFloat(String(value))
        if (isNaN(num)) return null
        return { numericValue: num, display: formatValue(num, toType) }
    }

    // Numeric → text
    if (isNumericType(fromType) && toType === 'text') {
        return { numericValue: typeof value === 'number' ? value : null, display: String(value ?? '') }
    }

    return null
}
