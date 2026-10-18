import { describe, expect, it } from 'vitest';
import { exceedsOneYear, fromPickerMin, isIsoDate, localTodayIso, minusOneYear, plusOneYear, tillPickerMax } from './date-range';

describe('one-year date range', () => {
    it('allows exactly one calendar year, inclusive, and rejects one day more', () => {
        expect(exceedsOneYear('2025-10-18', '2026-10-18')).toBe(false);
        expect(exceedsOneYear('2025-10-17', '2026-10-18')).toBe(true);
        expect(exceedsOneYear('2025-10-18', '2026-10-19')).toBe(true);
        expect(exceedsOneYear('2026-10-18', '2026-10-18')).toBe(false);
    });

    it('handles leap years: 29 Feb + 1 year is 28 Feb, and the boundary moves with it', () => {
        expect(plusOneYear('2024-02-29')).toBe('2025-02-28');
        expect(exceedsOneYear('2024-02-29', '2025-02-28')).toBe(false);
        expect(exceedsOneYear('2024-02-29', '2025-03-01')).toBe(true);
        expect(exceedsOneYear('2023-02-28', '2024-02-28')).toBe(false);
        expect(exceedsOneYear('2023-02-28', '2024-02-29')).toBe(true);     // a day past 28 Feb + 1 year
        expect(exceedsOneYear('2023-03-01', '2024-02-29')).toBe(false);
        expect(exceedsOneYear('2024-03-01', '2025-03-01')).toBe(false);
        expect(plusOneYear('2023-02-28')).toBe('2024-02-28');
    });

    it('handles month ends', () => {
        expect(plusOneYear('2025-01-31')).toBe('2026-01-31');
        expect(plusOneYear('2025-04-30')).toBe('2026-04-30');
        expect(plusOneYear('2025-12-31')).toBe('2026-12-31');
        expect(exceedsOneYear('2025-01-31', '2026-01-31')).toBe(false);
        expect(exceedsOneYear('2025-01-30', '2026-01-31')).toBe(true);
    });

    it('picker limits agree with the validator for every boundary', () => {
        for (const till of ['2026-10-18', '2024-02-29', '2025-02-28', '2026-03-01', '2025-12-31']) {
            const earliest = fromPickerMin(till)!;
            expect(exceedsOneYear(earliest, till)).toBe(false);
            const dayBefore = new Date(Date.parse(`${earliest}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
            expect(exceedsOneYear(dayBefore, till)).toBe(true);
        }
        expect(minusOneYear('2024-02-29')).toBe('2023-03-01');
    });

    it('caps the To picker at From + 1 year but never beyond today', () => {
        expect(tillPickerMax('2025-10-18', '2026-10-20')).toBe('2026-10-18');
        expect(tillPickerMax('2026-06-01', '2026-10-20')).toBe('2026-10-20');
        expect(tillPickerMax('', '2026-10-20')).toBe('2026-10-20');
        expect(tillPickerMax('2026-02-31', '2026-10-20')).toBe('2026-10-20');
        expect(fromPickerMin('')).toBeNull();
        expect(fromPickerMin('not-a-date')).toBeNull();
    });

    it('does not call blank or malformed dates "too long" (the screens report those separately)', () => {
        expect(exceedsOneYear('', '2026-10-18')).toBe(false);
        expect(exceedsOneYear('2020-01-01', '2026-02-31')).toBe(false);
        expect(isIsoDate('2026-02-31')).toBe(false);
        expect(isIsoDate('2024-02-29')).toBe(true);
    });

    it('takes today from the local calendar, not UTC', () => {
        expect(localTodayIso(new Date(2026, 9, 18, 0, 30))).toBe('2026-10-18');   // 00:30 local is still the 18th whatever the offset
        expect(localTodayIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });
});
