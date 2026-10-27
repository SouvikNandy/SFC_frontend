import { describe, expect, it } from 'vitest';

import { changeDirection } from './ticker.service';

describe('changeDirection', () => {
  it('is up for positive, down for negative and flat for zero or non-numeric changes', () => {
    expect(changeDirection(0.01)).toBe('up');
    expect(changeDirection(-0.01)).toBe('down');
    expect(changeDirection(0)).toBe('flat');
    expect(changeDirection(-0)).toBe('flat');
    expect(changeDirection(Number.NaN)).toBe('flat');
    expect(changeDirection(Number.POSITIVE_INFINITY)).toBe('flat');
  });
});
