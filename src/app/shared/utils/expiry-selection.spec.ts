import { cleanDates, defaultExpiry, selectExpiries } from './expiry-selection';

// The shape the backend returns: every expiry alive during the requested window, including later ones.
const JAN_2026 = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27', '2026-02-03', '2026-02-10', '2026-02-17', '2026-02-24', '2026-03-02', '2026-03-30', '2026-04-28', '2026-06-30'];

describe('selectExpiries', () => {
  it('keeps every valid date the API returns: historical and beyond To, none filtered by the range', () => {
    expect(selectExpiries(JAN_2026)).toEqual(JAN_2026);
    expect(selectExpiries(JAN_2026)).toContain('2026-01-06');
    expect(selectExpiries(JAN_2026)).toContain('2026-06-30');
  });

  it('keeps dates far in the future (the API lists through 2030)', () => {
    expect(selectExpiries(['2026-01-06', '2030-12-26'])).toEqual(['2026-01-06', '2030-12-26']);
  });

  it('removes duplicates, also those differing only by a time part', () => {
    expect(selectExpiries(['2026-01-27', '2026-01-06', '2026-01-27T00:00:00', '2026-01-06'])).toEqual(['2026-01-06', '2026-01-27']);
  });

  it('sorts chronologically across months and years', () => {
    expect(selectExpiries(['2027-01-26', '2026-03-30', '2025-12-30', '2026-01-06'])).toEqual(['2025-12-30', '2026-01-06', '2026-03-30', '2027-01-26']);
  });

  it('empty, missing and malformed input is safe', () => {
    expect(selectExpiries([])).toEqual([]);
    expect(selectExpiries(null)).toEqual([]);
    expect(selectExpiries(undefined)).toEqual([]);
    expect(selectExpiries(['x', '', '2026-13', 5, '2026-01-27T00:00:00'])).toEqual(['2026-01-27']);
  });

  it('does not depend on the system date', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-05-05T00:00:00Z') });
    try {
      expect(selectExpiries(JAN_2026)).toEqual(JAN_2026);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('defaultExpiry', () => {
  it('is the most recent expiry inside the range', () => {
    expect(defaultExpiry(['2026-01-06', '2026-01-27', '2026-02-24'], '2026-01-01', '2026-01-31')).toBe('2026-01-27');
  });
  it('falls back to the earliest option when nothing falls inside the range', () => {
    expect(defaultExpiry(['2026-02-24', '2026-03-30'], '2026-01-01', '2026-01-31')).toBe('2026-02-24');
  });
  it('is undefined for an empty list', () => {
    expect(defaultExpiry([], '2026-01-01', '2026-01-31')).toBeUndefined();
  });
});

describe('cleanDates', () => {
  it('sorts, removes duplicates and drops invalid values', () => {
    expect(cleanDates(['2026-02-01', '2026-01-01', '2026-02-01', 'nope'])).toEqual(['2026-01-01', '2026-02-01']);
  });
});
