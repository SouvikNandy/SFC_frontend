import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { TickerItem, TickerService, changeDirection } from '../../services/ticker.service';
import { TickerTapeComponent } from './ticker-tape.component';

const item = (symbol: string, change: number, latestDate?: string): TickerItem => ({
  symbol,
  price: '100.00',
  change: change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
  positive: change > 0,
  direction: changeDirection(change),
  priceValue: 100,
  changeValue: change,
  ...(latestDate ? { latestDate } : {}),
});

describe('TickerTapeComponent', () => {
  it('colours each change from its numeric direction and exposes the session date', () => {
    TestBed.configureTestingModule({ providers: [{ provide: TickerService, useValue: { getTicker: () => of([item('UP', 5, '2026-10-26'), item('DOWN', -5, '2026-10-26'), item('FLAT', 0)]) } }] });
    const fixture = TestBed.createComponent(TickerTapeComponent);
    fixture.detectChanges();
    const ticks = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tick'));
    const colour = (index: number) => (ticks[index].querySelectorAll('.num')[1] as HTMLElement).style.color;
    expect(colour(0)).toBe('var(--teal)');
    expect(colour(1)).toBe('var(--red)');
    expect(colour(2)).toBe('var(--muted)');
    expect(ticks[0].getAttribute('title')).toBe('As of 2026-10-26');
    expect(ticks[2].getAttribute('title')).toBeNull();
    expect(ticks[1].textContent).toContain('-5.00');
    expect(ticks[2].textContent).not.toMatch(/[+-]0\.00/);
  });
});
