import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { TickerItem, TickerService, changeDirection } from '../../../shared/services/ticker.service';
import { HomeService } from './home.service';
import { MarketCard } from './models/home.model';

const item = (symbol: string, price: number, change: number, apiPositive: boolean): TickerItem => ({
  symbol,
  price: price.toFixed(2),
  change: String(change),
  positive: apiPositive,
  direction: changeDirection(change),
  priceValue: price,
  changeValue: change,
});

describe('HomeService market summary', () => {
  const cards = (items: TickerItem[]): MarketCard[] => {
    TestBed.configureTestingModule({ providers: [{ provide: TickerService, useValue: { getTicker: () => of(items) } }] });
    let out: MarketCard[] = [];
    TestBed.inject(HomeService).getMarketSummary().subscribe((value) => (out = value));
    return out;
  };

  it('shows a loss with a minus sign and the down direction, whatever the API flag says', () => {
    const [card] = cards([item('NIFTY', 22576.6, -134.7, true)]);
    expect(card.direction).toBe('down');
    expect(card.up).toBe(false);
    expect(card.change).toBe('-134.70 (-0.59%)'); // previous close = 22576.6 + 134.7 = 22711.3
  });

  it('shows a gain with a plus sign and the up direction', () => {
    const [card] = cards([item('NIFTY', 22600, 100, false)]);
    expect(card.direction).toBe('up');
    expect(card.up).toBe(true);
    expect(card.change).toBe('+100.00 (+0.44%)');
  });

  it('describes the chain IV as an estimate on the quick link', () => {
    TestBed.configureTestingModule({ providers: [{ provide: TickerService, useValue: { getTicker: () => of([]) } }] });
    let links: Array<{ key: string; desc: string }> = [];
    TestBed.inject(HomeService).getQuickLinks().subscribe((value) => (links = value));
    expect(links.find((link) => link.key === 'chain')?.desc).toContain('estimated IV');
  });

  it('offers no quick link to the hidden Price Alerts or Blog & Reports pages', () => {
    TestBed.configureTestingModule({ providers: [{ provide: TickerService, useValue: { getTicker: () => of([]) } }] });
    let links: Array<{ key: string; title: string; desc: string }> = [];
    TestBed.inject(HomeService).getQuickLinks().subscribe((value) => (links = value));
    expect(links.map((link) => link.key)).toEqual(['portfolio', 'chain', 'greeks', 'payoff', 'eod']);
    expect(JSON.stringify(links)).not.toMatch(/alert|blog/i);
  });

  it('shows the session the figures belong to, formatted DD Mon YYYY, or nothing when the API does not say', () => {
    const [dated, undated] = cards([{ ...item('NIFTY', 22753.2, 153.2, true), latestDate: '2026-09-26' }, item('BANKNIFTY', 54366.7, 79.35, true)]);
    expect(dated.asOf).toBe('26 Sep 2026');
    expect(undated.asOf).toBe('');
  });

  it('treats zero change as flat: no sign, neither gain nor loss', () => {
    const [card] = cards([item('NIFTY', 22600, 0, true)]);
    expect(card.direction).toBe('flat');
    expect(card.up).toBe(false);
    expect(card.change).toBe('0.00 (0.00%)');
  });
});
