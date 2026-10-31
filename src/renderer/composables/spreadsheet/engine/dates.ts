/**
 * dates — the calendar arithmetic behind the date cell type.
 * Owns: serial numbers, parsing typed dates, formatting them for display.
 * Does NOT own: type detection (cellTypes.ts), date functions (evaluator.ts).
 *
 * A date is stored as a serial number: whole days since 30 December 1899, the
 * epoch Excel and Numbers use, so 1 January 2026 is 46023. Dates are calendar
 * days with no time and no zone; every conversion runs in UTC so a date never
 * shifts by a day across a daylight-saving change.
 */

const MS_PER_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(1899, 11, 30);

/** The order the day, month and year of a numeric date are written in. */
export type DateOrder = 'DMY' | 'MDY' | 'YMD';

/**
 * The serial for a calendar date. Out-of-range parts roll over the way
 * spreadsheets expect: month 13 is January of the next year, day 0 is the last
 * day of the previous month.
 */
export function dateToSerial(year: number, month: number, day: number): number {
    return Math.round((Date.UTC(year, month - 1, day) - EPOCH_MS) / MS_PER_DAY);
}

/** The calendar date a serial stands for. */
export function serialToDate(serial: number): { year: number; month: number; day: number } {
    const date = new Date(EPOCH_MS + Math.floor(serial) * MS_PER_DAY);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Today's serial, by the local calendar. */
export function todaySerial(now: Date = new Date()): number {
    return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * The order the system locale writes numeric dates in, read off a formatted
 * sample date rather than kept in a table of locales.
 */
export function localeDateOrder(locale?: string): DateOrder {
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(Date.UTC(2000, 0, 31)))
        .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
        .map((part) => part.type[0]?.toUpperCase() ?? '')
        .join('');
    return parts === 'DMY' || parts === 'MDY' || parts === 'YMD' ? parts : 'YMD';
}

const NUMERIC_DATE = /^(\d{1,4})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{1,4})\.?$/;

/**
 * Reads a typed date as a serial, or null if `text` is not one. ISO dates
 * (2026-03-04) are read the same everywhere; anything else with a four-digit
 * year at the end is read in `order`, so 04/03/2026 is 4 March in Italy and
 * April 3 in the US. The year must have four digits and the date must exist:
 * 31/02/2026 is not a date.
 */
export function parseDate(text: string, order: DateOrder = localeDateOrder()): number | null {
    const [, a = '', b = '', c = ''] = NUMERIC_DATE.exec(text.trim()) ?? [];
    if (a === '') return null;

    let year: string;
    let month: string;
    let day: string;
    if (a.length === 4) [year, month, day] = [a, b, c];
    else if (c.length === 4 && order === 'MDY') [month, day, year] = [a, b, c];
    else if (c.length === 4) [day, month, year] = [a, b, c];
    else return null;

    const [y, m, d] = [Number(year), Number(month), Number(day)];
    if (day.length > 2 || m < 1 || m > 12 || d < 1) return null;
    const serial = dateToSerial(y, m, d);
    // A day past the end of its month rolls over; that is not what was typed.
    return serialToDate(serial).day === d ? serial : null;
}

/**
 * A serial written as a date the way `order` reads it back: 2026-03-04 for
 * YMD, 04/03/2026 for DMY, 03/04/2026 for MDY. A fraction of a day is dropped.
 */
export function formatDate(serial: number, order: DateOrder = localeDateOrder()): string {
    const { year, month, day } = serialToDate(serial);
    const yyyy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    switch (order) {
        case 'YMD':
            return `${yyyy}-${mm}-${dd}`;
        case 'DMY':
            return `${dd}/${mm}/${yyyy}`;
        case 'MDY':
            return `${mm}/${dd}/${yyyy}`;
    }
}
