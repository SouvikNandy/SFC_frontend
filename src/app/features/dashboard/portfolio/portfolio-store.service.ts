import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { Basket, ContractRef, FillAction, FillResult, FillSide, LedgerFill, LedgerSnapshot } from './models/portfolio.model';
import { replayLedger, validateFill } from './portfolio-ledger';

export interface RecordFillInput {
    contract: ContractRef;
    side: FillSide;
    /** Lots. */
    qty: number;
    price: number;
    date: string;
    /** Existing basket id, or '' for none. */
    basketId: string;
    /** When set, a new basket with this name is created and the fill is tagged into it. */
    newBasketName?: string;
}

export type RecordFillOutcome =
    | { ok: true; action: FillAction; realised: number; basket: Basket | null }
    | { ok: false; error: string };

const STORAGE_PREFIX = 'sfc.portfolio.ledger.v1';
const MAX_BASKET_NAME = 40;

/**
 * The paper-trading ledger. The application has no portfolio endpoint, so the ledger is persisted in this
 * browser's localStorage (one book per signed-in user, one for guests). It is never sent anywhere, and the UI
 * never presents it as saved on a server. Open positions and closed trades are derived by replaying the fills.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioStoreService {
    private readonly auth = inject(AuthService);

    readonly fills = signal<LedgerFill[]>([]);
    readonly baskets = signal<Basket[]>([]);
    /** False when the browser refused to store the ledger (private mode, quota): changes will not survive a reload. */
    readonly persisted = signal(true);

    readonly ledger = computed(() => replayLedger(this.fills(), this.baskets()));

    private readonly storageKey = computed(() => `${STORAGE_PREFIX}:${this.auth.currentUser()?.id ?? 'guest'}`);
    private loadedKey = '';
    private counter = 0;

    constructor() {
        // Reload when the signed-in user changes so books never mix between accounts.
        effect(() => {
            const key = this.storageKey();
            if (key === this.loadedKey) return;
            this.loadedKey = key;
            this.load(key);
        });
    }

    recordFill(input: RecordFillInput): RecordFillOutcome {
        const error = validateFill({ qty: input.qty, price: input.price, lot: input.contract.lot, date: input.date });
        if (error) return { ok: false, error };

        let basket: Basket | null = null;
        let basketId: string | null = input.basketId || null;
        if (input.newBasketName !== undefined) {
            const name = input.newBasketName.trim().slice(0, MAX_BASKET_NAME);
            if (!name) return { ok: false, error: 'Enter a name for the new basket, or pick "No basket".' };
            if (this.baskets().some(existing => existing.name.toLowerCase() === name.toLowerCase())) {
                return { ok: false, error: `A basket named “${name}” already exists. Pick it from the list.` };
            }
            basket = { id: this.newId('bk'), name };
            basketId = basket.id;
        } else if (basketId && !this.baskets().some(existing => existing.id === basketId)) {
            return { ok: false, error: 'The selected basket no longer exists.' };
        }

        const fill: LedgerFill = {
            id: this.newId('fl'),
            contract: input.contract,
            side: input.side,
            qty: input.qty,
            price: input.price,
            lot: input.contract.lot,
            date: input.date,
            basketId,
        };
        const nextFills = [...this.fills(), fill];
        const nextBaskets = basket ? [...this.baskets(), basket] : this.baskets();
        let result: FillResult = { action: 'opened', realised: 0 };
        replayLedger(nextFills, nextBaskets, (applied, outcome) => { if (applied.id === fill.id) result = outcome; });

        this.fills.set(nextFills);
        this.baskets.set(nextBaskets);
        this.persist();
        return { ok: true, action: result.action, realised: result.realised, basket };
    }

    /** Books the closing fill for an open position (a ledger entry, not an order). */
    squareOff(contractKey: string, price: number, date: string): RecordFillOutcome {
        const position = this.ledger().positions.find(p => p.contract.key === contractKey);
        if (!position) return { ok: false, error: 'This position is already closed.' };
        return this.recordFill({
            contract: position.contract,
            side: position.qty > 0 ? 'sell' : 'buy',
            qty: Math.abs(position.qty),
            price,
            date,
            basketId: position.basketId ?? '',
        });
    }

    /** Returns an error message, or '' on success. */
    renameBasket(id: string, name: string): string {
        const clean = name.trim().slice(0, MAX_BASKET_NAME);
        if (!clean) return 'Enter a basket name.';
        if (this.baskets().some(b => b.id !== id && b.name.toLowerCase() === clean.toLowerCase())) return `A basket named “${clean}” already exists.`;
        this.baskets.update(list => list.map(b => (b.id === id ? { ...b, name: clean } : b)));
        this.persist();
        return '';
    }

    /** Positions and closed trades stay; they simply become unassigned. */
    deleteBasket(id: string): void {
        this.baskets.update(list => list.filter(b => b.id !== id));
        this.persist();
    }

    private newId(prefix: string): string {
        return `${prefix}_${Date.now().toString(36)}_${(this.counter++).toString(36)}`;
    }

    private load(key: string): void {
        try {
            const raw = localStorage.getItem(key);
            const snapshot = raw ? (JSON.parse(raw) as Partial<LedgerSnapshot>) : null;
            const valid = snapshot?.version === 1 && Array.isArray(snapshot.fills) && Array.isArray(snapshot.baskets);
            this.fills.set(valid ? (snapshot!.fills as LedgerFill[]) : []);
            this.baskets.set(valid ? (snapshot!.baskets as Basket[]) : []);
            this.persisted.set(true);
        } catch {
            this.fills.set([]);
            this.baskets.set([]);
            this.persisted.set(false);
        }
    }

    private persist(): void {
        try {
            const snapshot: LedgerSnapshot = { version: 1, fills: this.fills(), baskets: this.baskets() };
            localStorage.setItem(this.storageKey(), JSON.stringify(snapshot));
            this.persisted.set(true);
        } catch {
            this.persisted.set(false);
        }
    }
}
