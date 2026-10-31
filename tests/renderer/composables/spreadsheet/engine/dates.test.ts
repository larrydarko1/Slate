import { describe, it, expect } from 'vitest';

import {
    dateToSerial,
    formatDate,
    localeDateOrder,
    parseDate,
    serialToDate,
    todaySerial,
} from '@/renderer/composables/spreadsheet/engine/dates';

describe('serial numbers', () => {
    it('counts days from the spreadsheet epoch', () => {
        expect(dateToSerial(1899, 12, 30)).toBe(0);
        expect(dateToSerial(2026, 1, 1)).toBe(46023);
    });

    it('round-trips through a calendar date', () => {
        expect(serialToDate(46023)).toEqual({ year: 2026, month: 1, day: 1 });
        expect(serialToDate(dateToSerial(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
    });

    it('rolls out-of-range parts over', () => {
        expect(dateToSerial(2026, 13, 1)).toBe(dateToSerial(2027, 1, 1));
        expect(dateToSerial(2026, 3, 0)).toBe(dateToSerial(2026, 2, 28));
    });

    it('drops a fraction of a day', () => {
        expect(serialToDate(46023.75)).toEqual({ year: 2026, month: 1, day: 1 });
    });

    it('reads today off the local calendar', () => {
        expect(todaySerial(new Date(2026, 2, 4, 23, 59))).toBe(dateToSerial(2026, 3, 4));
    });
});

describe('localeDateOrder', () => {
    it.each([
        ['en-US', 'MDY'],
        ['it-IT', 'DMY'],
        ['de-DE', 'DMY'],
        ['ja-JP', 'YMD'],
    ])('reads %s as %s', (locale, order) => {
        expect(localeDateOrder(locale)).toBe(order);
    });
});

describe('parseDate', () => {
    const march4 = dateToSerial(2026, 3, 4);

    it('reads an ISO date the same in every order', () => {
        expect(parseDate('2026-03-04', 'MDY')).toBe(march4);
        expect(parseDate('2026-03-04', 'DMY')).toBe(march4);
        expect(parseDate('2026/3/4', 'DMY')).toBe(march4);
    });

    it('reads the day and month in the order given', () => {
        expect(parseDate('04/03/2026', 'DMY')).toBe(march4);
        expect(parseDate('03/04/2026', 'MDY')).toBe(march4);
        expect(parseDate('4.3.2026', 'DMY')).toBe(march4);
        expect(parseDate('4-3-2026', 'DMY')).toBe(march4);
    });

    it('allows the spacing and trailing dot some locales write', () => {
        expect(parseDate('2026. 03. 04.', 'YMD')).toBe(march4);
    });

    it.each(['31/02/2026', '13/13/2026', '0/1/2026', '1/2/26', '2026-03', '12.5', 'March 4', '2026-03-2026'])(
        'rejects %s',
        (text) => {
            expect(parseDate(text, 'DMY')).toBeNull();
        },
    );
});

describe('formatDate', () => {
    const march4 = dateToSerial(2026, 3, 4);

    it.each([
        ['YMD', '2026-03-04'],
        ['DMY', '04/03/2026'],
        ['MDY', '03/04/2026'],
    ] as const)('writes %s as %s', (order, text) => {
        expect(formatDate(march4, order)).toBe(text);
    });

    it.each(['YMD', 'DMY', 'MDY'] as const)('reads back what it writes in %s', (order) => {
        expect(parseDate(formatDate(march4, order), order)).toBe(march4);
    });
});
