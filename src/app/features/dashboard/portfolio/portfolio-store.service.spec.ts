import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { makeContract } from './portfolio-contract';
import { PortfolioStoreService } from './portfolio-store.service';

const FUT = makeContract({ underlying: 'NIFTY', kind: 'future', expiry: '2026-10-29', strike: null, optionType: null, lot: 75 });
const CE = makeContract({ underlying: 'NIFTY', kind: 'option', expiry: '2026-10-29', strike: 22600, optionType: 'CE', lot: 75 });

function create(): PortfolioStoreService {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
  const store = TestBed.inject(PortfolioStoreService);
  TestBed.tick();
  return store;
}

describe('PortfolioStoreService', () => {
  beforeEach(() => localStorage.clear());

  it('records a fill, derives the position and persists it locally', () => {
    const store = create();
    const outcome = store.recordFill({ contract: CE, side: 'buy', qty: 2, price: 100, date: '2026-10-01', basketId: '' });
    expect(outcome).toMatchObject({ ok: true, action: 'opened', realised: 0 });
    expect(store.ledger().positions[0]).toMatchObject({ qty: 2, avg: 100 });
    const saved = JSON.parse(localStorage.getItem('sfc.portfolio.ledger.v1:guest')!);
    expect(saved.fills).toHaveLength(1);
    expect(store.persisted()).toBe(true);
  });

  it('survives a reload (new service instance reads the stored book)', () => {
    create().recordFill({ contract: CE, side: 'buy', qty: 1, price: 50, date: '2026-10-01', basketId: '' });
    TestBed.resetTestingModule();
    const reloaded = create();
    expect(reloaded.ledger().positions).toHaveLength(1);
    expect(reloaded.ledger().positions[0].avg).toBe(50);
  });

  it('rejects invalid fills without changing or saving anything', () => {
    const store = create();
    expect(store.recordFill({ contract: CE, side: 'buy', qty: 0, price: 50, date: '2026-10-01', basketId: '' })).toMatchObject({ ok: false });
    expect(store.recordFill({ contract: CE, side: 'buy', qty: 1, price: 0, date: '2026-10-01', basketId: '' })).toMatchObject({ ok: false });
    expect(store.recordFill({ contract: CE, side: 'buy', qty: 1, price: 5, date: 'nope', basketId: '' })).toMatchObject({ ok: false });
    expect(store.fills()).toHaveLength(0);
    expect(localStorage.getItem('sfc.portfolio.ledger.v1:guest')).toBeNull();
  });

  it('reports the action and realised P&L for reducing, closing and flipping fills', () => {
    const store = create();
    store.recordFill({ contract: FUT, side: 'buy', qty: 2, price: 100, date: '2026-10-01', basketId: '' });
    const added = store.recordFill({ contract: FUT, side: 'buy', qty: 1, price: 106, date: '2026-10-01', basketId: '' });
    expect(added).toMatchObject({ ok: true, action: 'added' });
    const reduced = store.recordFill({ contract: FUT, side: 'sell', qty: 1, price: 112, date: '2026-10-02', basketId: '' });
    expect(reduced).toMatchObject({ ok: true, action: 'reduced', realised: (112 - 102) * 1 * 75 });
    const flipped = store.recordFill({ contract: FUT, side: 'sell', qty: 4, price: 110, date: '2026-10-03', basketId: '' });
    expect(flipped).toMatchObject({ ok: true, action: 'flipped' });
    expect(store.ledger().positions[0].qty).toBe(-2);
    const closed = store.recordFill({ contract: FUT, side: 'buy', qty: 2, price: 100, date: '2026-10-04', basketId: '' });
    expect(closed).toMatchObject({ ok: true, action: 'closed', realised: (110 - 100) * 2 * 75 });
    expect(store.ledger().positions).toHaveLength(0);
  });

  it('creates a basket with the first fill, rejects duplicates and unknown baskets', () => {
    const store = create();
    const first = store.recordFill({ contract: CE, side: 'buy', qty: 1, price: 50, date: '2026-10-01', basketId: '', newBasketName: '  Nifty swing ' });
    expect(first).toMatchObject({ ok: true });
    expect(store.baskets()).toHaveLength(1);
    expect(store.baskets()[0].name).toBe('Nifty swing');
    expect(store.ledger().positions[0].basketId).toBe(store.baskets()[0].id);

    expect(store.recordFill({ contract: FUT, side: 'buy', qty: 1, price: 5, date: '2026-10-01', basketId: '', newBasketName: 'nifty SWING' })).toMatchObject({ ok: false });
    expect(store.recordFill({ contract: FUT, side: 'buy', qty: 1, price: 5, date: '2026-10-01', basketId: '', newBasketName: '   ' })).toMatchObject({ ok: false });
    expect(store.recordFill({ contract: FUT, side: 'buy', qty: 1, price: 5, date: '2026-10-01', basketId: 'ghost' })).toMatchObject({ ok: false });
    expect(store.baskets()).toHaveLength(1);
  });

  it('squares off at the confirmed price (a ledger entry) and keeps the basket', () => {
    const store = create();
    store.recordFill({ contract: CE, side: 'sell', qty: 2, price: 100, date: '2026-10-01', basketId: '', newBasketName: 'B' });
    const out = store.squareOff(CE.key, 80, '2026-10-02');
    expect(out).toMatchObject({ ok: true, action: 'closed', realised: (100 - 80) * 2 * 75 });
    expect(store.ledger().closed[0].basketId).toBe(store.baskets()[0].id);
    expect(store.squareOff(CE.key, 80, '2026-10-02')).toMatchObject({ ok: false });
  });

  it('renames (validating duplicates) and deletes baskets without losing positions', () => {
    const store = create();
    store.recordFill({ contract: CE, side: 'buy', qty: 1, price: 50, date: '2026-10-01', basketId: '', newBasketName: 'One' });
    store.recordFill({ contract: FUT, side: 'buy', qty: 1, price: 50, date: '2026-10-01', basketId: '', newBasketName: 'Two' });
    const [one, two] = store.baskets();
    expect(store.renameBasket(one.id, '')).not.toBe('');
    expect(store.renameBasket(one.id, 'two')).toMatch(/already exists/);
    expect(store.renameBasket(one.id, 'Renamed')).toBe('');
    expect(store.baskets()[0].name).toBe('Renamed');
    store.deleteBasket(two.id);
    expect(store.baskets()).toHaveLength(1);
    expect(store.ledger().positions).toHaveLength(2);
    expect(store.ledger().positions.find(p => p.contract.key === FUT.key)?.basketId).toBeNull();
  });

  it('flags when the browser refuses to store the book, instead of pretending it was saved', () => {
    const store = create();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    store.recordFill({ contract: CE, side: 'buy', qty: 1, price: 50, date: '2026-10-01', basketId: '' });
    expect(store.persisted()).toBe(false);
    expect(store.ledger().positions).toHaveLength(1); // still usable this session
    spy.mockRestore();
  });

  it('starts empty on corrupt stored data', () => {
    localStorage.setItem('sfc.portfolio.ledger.v1:guest', '{not json');
    const store = create();
    expect(store.fills()).toEqual([]);
  });
});
