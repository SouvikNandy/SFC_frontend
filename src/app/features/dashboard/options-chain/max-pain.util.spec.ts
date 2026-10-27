import { describe, expect, it } from 'vitest';

import { computeMaxPain } from './max-pain.util';

const row = (strike: number, callOi: number, putOi: number) => ({ strike, call: { oi: callOi }, put: { oi: putOi } });

describe('computeMaxPain', () => {
  // Hand-calculated. Call OI 100:10 110:20 120:5; Put OI 100:5 110:20 120:40.
  //   K=100: puts 20·10 + 40·20 = 1000
  //   K=110: calls 10·10 = 100, puts 40·10 = 400 → 500
  //   K=120: calls 10·20 + 20·10 = 400 → 400   ← lowest
  const chain = [row(100, 10, 5), row(110, 20, 20), row(120, 5, 40)];

  it('returns the strike with the lowest total payout', () => {
    expect(computeMaxPain(chain)).toBe(120);
  });

  it('does not depend on row order', () => {
    expect(computeMaxPain([...chain].reverse())).toBe(120);
  });

  it('changes when the chain (expiry) changes', () => {
    expect(computeMaxPain([row(100, 50, 1), row(110, 1, 1), row(120, 1, 1)])).toBe(100); // heavy call OI at 100 pulls it down
  });

  it('resolves ties to the lowest strike', () => {
    // Put OI 120 = 30 makes K=110 and K=120 both cost 400 (K=100 costs 800).
    expect(computeMaxPain([row(100, 10, 5), row(110, 20, 20), row(120, 5, 30)])).toBe(110);
  });

  it('returns null for an empty chain', () => {
    expect(computeMaxPain([])).toBeNull();
  });

  it('returns null when every OI value is zero', () => {
    expect(computeMaxPain([row(100, 0, 0), row(110, 0, 0)])).toBeNull();
  });

  it('treats missing, NaN and negative OI as zero', () => {
    expect(computeMaxPain([row(100, Number.NaN, undefined as unknown as number), row(110, -5, Number.NaN)])).toBeNull();
    // The only real OI is a put at 120: any K ≤ 120 costs 0·… K=100 costs 10·20, K=110 costs 10·10, K=120 costs 0.
    expect(computeMaxPain([row(100, Number.NaN, 0), row(110, 0, Number.NaN), row(120, 0, 10)])).toBe(120);
  });

  it('ignores rows with an invalid strike', () => {
    expect(computeMaxPain([row(Number.NaN, 99, 99), row(0, 99, 99), ...chain])).toBe(120);
  });

  it('agrees with a literal transcription of the client formula on random chains', () => {
    // Deterministic pseudo-random generator so failures are reproducible.
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 200; run++) {
      const count = 2 + Math.floor(next() * 12);
      const rows = Array.from({ length: count }, (_, i) => row(100 + i * 50, Math.floor(next() * 1000), Math.floor(next() * 1000)));
      const total = (k: number) => rows.reduce((sum, s) => sum + s.call.oi * Math.max(k - s.strike, 0) + s.put.oi * Math.max(s.strike - k, 0), 0);
      const lowest = Math.min(...rows.map((r) => total(r.strike)));
      const expected = rows.filter((r) => total(r.strike) === lowest).map((r) => r.strike).sort((a, b) => a - b)[0];
      const hasOi = rows.some((r) => r.call.oi > 0 || r.put.oi > 0);
      expect(computeMaxPain(rows)).toBe(hasOi ? expected : null);
    }
  });

  it('uses every strike, including far out-of-the-money ones', () => {
    const wide = [row(50, 0, 0), row(100, 10, 5), row(110, 20, 20), row(120, 5, 40), row(500, 0, 0)];
    expect(computeMaxPain(wide)).toBe(120);
    expect(computeMaxPain([...chain, row(90, 1000, 0)])).not.toBe(120); // heavy far call OI moves the answer
  });
});
