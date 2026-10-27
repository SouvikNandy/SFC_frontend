import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EMPTY, Subject, catchError, combineLatest, finalize, switchMap, takeUntil, tap } from 'rxjs';
import { GreeksCalculatorService, GreeksInput } from './greeks-calculator.service';
import { GreeksSymbolDetails } from './greeks.model';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { daysToExpiry, expiryNote } from '../../../shared/utils/expiry';
import { CLOSE_EOD_LABEL } from '../../../shared/utils/price-labels';
import { formatDisplayDate } from '../../../shared/utils/date-format';
import { OptionsChainService } from '../options-chain/options-chain.service';
import { solveIvInContext } from '../../../shared/pricing/contract-iv';
import { BlackScholesGreeks, InstrumentKind, blackScholesGreeks, marketParams } from '../../../shared/pricing/option-pricing';
import { PricingContext, PricingContextService, describePricingFailure } from '../../../shared/pricing/pricing-context.service';
import { ActivatedRoute } from '@angular/router';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import { LiveDataAccessService } from '../live-data/live-data-access.service';

@Component({
    selector: 'app-greeks',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, LiveDataAccessComponent],
    templateUrl: './greeks.component.html',
    styleUrls: ['./greeks.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GreeksComponent implements OnInit, OnDestroy {
    form: ReturnType<FormBuilder['group']>;

    strikeOptions: number[] = [];
    /**
     * Model prices and Greeks. In EOD mode call and put are evaluated at their own implied volatility (`callIvPct`, `putIvPct`),
     * so gamma and vega exist per side (`gammaPut`, `vegaPut`).
     */
    results: Partial<BlackScholesGreeks & { gammaPut: number; vegaPut: number; callIvPct: number; putIvPct: number; markerLeft: number; moneynessText: string }> = {};
    /** Why a side has no implied volatility (EOD mode), in words. */
    ivSideNotes: { call: string; put: string } = { call: '', put: '' };
    /** EOD mode: instrument type, underlying, rate and dividend resolved for the selected expiry. */
    pricingContext: PricingContext | null = null;
    /** Custom mode: which approved market parameters (index or stock) the rate and dividend start from. */
    customKind: InstrumentKind = 'index';
    inputError = '';
    ivResultText = '';
    ivResultVisible = false;
    badgeText = '';
    symbols: string[] = [];
    filteredSymbols: string[] = [];
    symbolsLoading = true;
    symbolDetailsLoading = false;
    suggestionsOpen = false;
    highlightedSymbolIndex = -1;
    symbolDetails: GreeksSymbolDetails | null = null;
    /** Expiry date the day count was derived from; empty once the days are typed by hand. */
    expiryDate = '';
    /** Where the Annual volatility field (Custom mode) came from: a solved implied volatility, or typing. */
    volSource: 'implied' | 'manual' = 'manual';
    get volSourceNote(): string {
        return this.volSource === 'implied' ? 'Implied volatility solved from the market price above' : '';
    }
    get underlyingNote(): string {
        if (this.form.value.sourceMode !== 'eod') return '';
        const context = this.pricingContext;
        if (!context) return this.closeStatus === 'loading' ? 'Loading…' : '';
        if (!context.ok) return describePricingFailure(context.reason);
        return context.kind === 'index'
            ? 'Spot index value'
            : `Futures close, ${formatDisplayDate(this.closeExpiry)} expiry${context.futures?.tradeDate ? ` (${formatDisplayDate(context.futures.tradeDate)})` : ''}`;
    }
    get ratesNote(): string {
        if (this.form.value.sourceMode === 'custom') return `Approved ${this.customKind} parameters; editable`;
        return this.pricingContext?.ok ? `Approved ${this.pricingContext.kind} parameters` : '';
    }
    fmtIv(value: number | undefined): string { return value === undefined ? '–' : `${value.toFixed(2)}%`; }
    readonly closeLabel = CLOSE_EOD_LABEL;
    /** EOD close per strike for the expiry above (the chain's c_ltp / p_ltp fields carry the EOD close). */
    private closeQuotes: Map<number, { call: number; put: number }> | null = null;
    private closeExpiry = '';
    closeStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    get closePriceHint(): string {
        const where = this.closeExpiry ? ` · ${formatDisplayDate(this.closeExpiry)} expiry` : '';
        if (this.closeStatus === 'loading') return `Loading ${this.closeLabel}…`;
        if (this.closeStatus === 'error') return `${this.closeLabel} is unavailable. Switch to Custom to enter a price.`;
        if (this.closeStatus === 'ready' && this.closePrice() === null) return `No ${this.closeLabel} for this strike`;
        return `${this.closeLabel} · ${this.form.get('ivType')!.value === 'put' ? 'put' : 'call'}${where}, BhavCopy`;
    }
    get expiryDisplayNote(): string { return expiryNote(this.expiryDate); }
    private symbolsRequested = false;
    private readonly chains = inject(OptionsChainService);
    private readonly pricing = inject(PricingContextService);
    private readonly symbolSelection$ = new Subject<string>();
    /** Request for the EOD close of every strike of one expiry; null cancels and clears. */
    private readonly closeRequest$ = new Subject<{ symbol: string; expiry: string } | null>();
    private readonly destroy$ = new Subject<void>();
    private lastSolvedIv: number | null = null;

    constructor(private fb: FormBuilder, public svc: GreeksCalculatorService, private readonly toast: ToastService, private readonly changeDetector: ChangeDetectorRef,
        private readonly route: ActivatedRoute, private readonly liveAccess: LiveDataAccessService) {
        this.form = this.fb.group({
            sourceMode: ['eod'],
            symbol: ['', Validators.required],
            presetKey: [''],
            spotKey: [''],
            spot: [24800, [Validators.required, Validators.min(0.0001)]],
            strikeKey: ['24800'],
            strike: [24800, [Validators.required, Validators.min(0.0001)]],
            rate: [marketParams('index').riskFreeRate * 100, Validators.required],
            vol: [12.5, Validators.required],
            expiry: [7, Validators.required],
            dividend: [marketParams('index').dividendYield * 100, Validators.required],
            ivType: ['call'],
            ivPrice: [null],
            ivSource: ['auto']
        });
    }

    ngOnInit() {
        if (this.liveAccess.requestedLive(this.route.snapshot)) this.setMode('live');
        // Subscribe before loading: the cached symbol list emits synchronously and would otherwise be lost.
        this.setupSymbolDetailsLoading();
        this.setupCloseLoading();
        // Live Data is a separate view: symbol/EOD APIs load only when EOD is opened.
        if (this.form.value.sourceMode === 'eod') this.loadSymbols();
        // subscribe individually to replicate prototype 'input' behaviour and sync logic
        const spotCtrl = this.form.get('spot')!;
        const strikeCtrl = this.form.get('strike')!;
        const rateCtrl = this.form.get('rate')!;
        const volCtrl = this.form.get('vol')!;
        const expiryCtrl = this.form.get('expiry')!;
        const dividendCtrl = this.form.get('dividend')!;

        const manualChange = () => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry: edit any field below';
            this.calculate();
            this.autofillIvPrice();
        };

        spotCtrl.valueChanges.subscribe((val: number) => {
            // emulate prototype: mark preset custom, update strike select chain and spotSelect if matching
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry: edit any field below';
            const spot = Number(val) || 0;
            this.populateStrikeOptions(spot, this.niceStep(spot));
            this.form.patchValue({ spotKey: 'custom' }, { emitEvent: false });
            this.calculate();
            this.autofillIvPrice();
        });

        strikeCtrl.valueChanges.subscribe((val: number) => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry: edit any field below';
            const opts = this.strikeOptions.map(s => String(s));
            const v = String(val);
            this.form.patchValue({ strikeKey: opts.includes(v) ? v : 'custom' }, { emitEvent: false });
            this.calculate();
            this.autofillIvPrice();
        });

        [rateCtrl, volCtrl, expiryCtrl, dividendCtrl].forEach(ctrl => ctrl.valueChanges.subscribe(() => manualChange()));
        // The observed price belongs to the option side: switching Call/Put must re-read it.
        this.form.get('ivType')!.valueChanges.subscribe(() => this.autofillIvPrice());
        volCtrl.valueChanges.subscribe(() => { this.volSource = 'manual'; });
        // A hand-edited day count no longer belongs to the loaded expiry date.
        expiryCtrl.valueChanges.subscribe(() => { this.expiryDate = ''; });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.symbolSelection$.complete();
    }

    niceStep(spot: number) {
        if (spot >= 20000) return 100;
        if (spot >= 5000) return 50;
        if (spot >= 1000) return 20;
        if (spot >= 200) return 10;
        return 5;
    }

    buildStrikeChain(spot: number, step: number) {
        const atm = Math.round(spot / step) * step;
        const strikes: number[] = [];
        for (let i = -5; i <= 5; i++) strikes.push(atm + i * step);
        return strikes;
    }

    populateStrikeOptions(spot: number, step: number) {
        this.strikeOptions = this.buildStrikeChain(spot, step);
    }

    setMode(mode: string) {
        this.form.patchValue({ sourceMode: mode });
        // reset badge text when switching modes
        this.badgeText = '';
        if (mode === 'custom') {
            this.form.patchValue({ presetKey: 'custom' });
            this.expiryDate = '';
            this.closeRequest$.next(null);
            this.pricingContext = null;
            this.selectCustomKind(this.customKind);
            // enable inputs for manual mode
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
        } else if (mode === 'eod') {
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
            // EOD APIs run only while the EOD tab is active.
            const symbol = this.form.value.symbol;
            if (!this.symbolsRequested) this.loadSymbols();
            else if (!this.symbolDetails && !this.symbolDetailsLoading && symbol) this.selectSymbol(symbol);
        } else if (mode === 'live') {
            // Live Data is a separate view; cancel any in-flight EOD request.
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.disable());
            if (this.symbolDetailsLoading) this.symbolSelection$.next('');
            this.closeRequest$.next(null);
        }
        if (mode === 'eod' && this.symbolDetails && this.closeStatus !== 'ready' && this.closeStatus !== 'loading') this.loadClosePrices();
    }

    /**
     * Fills the observed market price from the EOD close of the selected strike and side. A model (Black-Scholes)
     * price is never written here: it is not an observation. Without a close the field is left empty, not guessed.
     */
    autofillIvPrice() {
        if (this.form.value.sourceMode !== 'eod' || this.form.value.ivSource !== 'auto') return;
        if (this.closeStatus === 'loading' || this.closeStatus === 'error') return;
        this.form.patchValue({ ivPrice: this.closePrice() }, { emitEvent: false });
    }

    private closePrice(): number | null {
        // Read the controls, not form.value: this runs inside a control's valueChanges, before the parent group updates.
        const quote = this.closeQuotes?.get(Number(this.form.get('strike')!.value));
        const price = quote ? (this.form.get('ivType')!.value === 'put' ? quote.put : quote.call) : null;
        return price !== null && Number.isFinite(price) && price > 0 ? price : null;
    }

    private loadClosePrices(): void {
        const symbol = this.form.value.symbol;
        const request = this.form.value.sourceMode === 'eod' && symbol && this.expiryDate ? { symbol, expiry: this.expiryDate } : null;
        this.closeRequest$.next(request);
    }

    private setupCloseLoading(): void {
        this.closeRequest$.pipe(
            takeUntil(this.destroy$),
            tap(request => {
                this.closeQuotes = null;
                this.pricingContext = null;
                this.closeExpiry = request?.expiry ?? '';
                this.closeStatus = request ? 'loading' : 'idle';
                if (this.form.value.ivSource === 'auto') this.form.patchValue({ ivPrice: null }, { emitEvent: false });
                this.changeDetector.markForCheck();
            }),
            switchMap(request => request ? combineLatest({
                view: this.chains.getOptionChain(request),
                context: this.pricing.resolve(request.symbol, request.expiry, this.symbolDetails?.underlying),
            }).pipe(
                catchError(() => {
                    this.closeStatus = 'error';
                    this.changeDetector.markForCheck();
                    return EMPTY;
                })
            ) : EMPTY)
        ).subscribe(({ view, context }) => {
            this.closeQuotes = new Map(view.rows.map(row => [row.strike, { call: row.call.ltp, put: row.put.ltp }] as const));
            this.pricingContext = context;
            this.closeStatus = 'ready';
            // Underlying, rate and dividend come from the instrument type; nothing is carried over from another symbol.
            if (context.ok) this.form.patchValue({ spot: context.underlying, rate: context.riskFreeRate * 100, dividend: context.dividendYield * 100 }, { emitEvent: false });
            this.calculate();
            this.autofillIvPrice();
            this.changeDetector.markForCheck();
        });
    }

    /** EOD mode: call and put are each evaluated at the IV solved from their own Close (EOD). */
    private calculateEod(): void {
        this.ivSideNotes = { call: '', put: '' };
        const context = this.pricingContext;
        if (!context?.ok) {
            this.results = {};
            this.inputError = context ? describePricingFailure(context.reason) : '';
            return;
        }
        const strike = Number(this.form.value.strike);
        const days = Number(this.form.value.expiry);
        if (!(strike > 0)) {
            this.results = {};
            this.inputError = 'Strike price must be greater than 0.';
            return;
        }
        this.inputError = '';
        const quote = this.closeQuotes?.get(strike);
        const solve = (side: 'call' | 'put') => {
            const solved = solveIvInContext(context, { side, strike, days, close: quote ? (side === 'call' ? quote.call : quote.put) : null });
            this.ivSideNotes[side] = solved.ok ? '' : describePricingFailure(solved.reason);
            return solved.ok ? { ivPct: solved.ivPct, greeks: blackScholesGreeks(context.underlying, strike, context.riskFreeRate, context.dividendYield, solved.ivPct / 100, days / 365) } : null;
        };
        const call = solve('call');
        const put = solve('put');
        const any = call?.greeks ?? put?.greeks;
        const probability = any ? this.svc.normCdf(any.d2) * 100 : undefined;
        const ratio = context.underlying / strike;
        this.results = {
            callPrice: call?.greeks.callPrice, putPrice: put?.greeks.putPrice,
            deltaCall: call?.greeks.deltaCall, deltaPut: put?.greeks.deltaPut,
            gamma: call?.greeks.gamma, gammaPut: put?.greeks.gamma,
            thetaCall: call?.greeks.thetaCall, thetaPut: put?.greeks.thetaPut,
            vega: call?.greeks.vega, vegaPut: put?.greeks.vega,
            rhoCall: call?.greeks.rhoCall, rhoPut: put?.greeks.rhoPut,
            nd1: any?.nd1, d1: any?.d1, d2: any?.d2,
            callIvPct: call?.ivPct, putIvPct: put?.ivPct,
            ...(probability === undefined ? {} : {
                markerLeft: Math.max(4, Math.min(96, probability)),
                moneynessText: this.svc.fmt(probability, 1) + '% ITM probability' + ((ratio <= 1.003 && ratio >= 0.997) ? ' (ATM)' : ''),
            }),
        };
    }

    calculate() {
        if (this.form.value.sourceMode === 'eod') { this.calculateEod(); return; }
        this.ivSideNotes = { call: '', put: '' };
        const inVal: GreeksInput = {
            spot: Number(this.form.value.spot),
            strike: Number(this.form.value.strike),
            rate: Number(this.form.value.rate),
            vol: Number(this.form.value.vol),
            expiryDays: Number(this.form.value.expiry),
            dividend: Number(this.form.value.dividend)
        };
        const { errors, badFields } = this.svc.validateInputs(inVal);
        if (errors.length) {
            this.inputError = errors[0];
            this.results = {};
            return;
        }
        this.inputError = '';
        const r = this.svc.calculateAll(inVal);
        this.results = r;

        // update marker and moneyness tag as prototype
        const ratio = inVal.spot / inVal.strike;
        const pct = Math.max(4, Math.min(96, this.svc.normCdf(r.d2) * 100));
        // store for template
        this.results = { ...r, markerLeft: pct, moneynessText: this.svc.fmt(this.svc.normCdf(r.d2) * 100, 1) + '% ITM probability' + ((ratio <= 1.003 && ratio >= 0.997) ? ' (ATM)' : '') };
    }

    solveIv() {
        const S = Number(this.form.value.spot);
        const K = Number(this.form.value.strike);
        const r = Number(this.form.value.rate) / 100;
        const q = Number(this.form.value.dividend) / 100;
        const days = Number(this.form.value.expiry);
        const type = this.form.value.ivType;
        const marketPrice = Number(this.form.value.ivPrice);
        if (isNaN(marketPrice) || marketPrice <= 0) { this.ivResultText = 'Enter a market price first'; this.ivResultVisible = true; return; }
        const solved = solveIvInContext({ underlying: S, riskFreeRate: r, dividendYield: q }, { side: type, strike: K, days, close: marketPrice });
        if (!solved.ok) { this.ivResultText = describePricingFailure(solved.reason); this.ivResultVisible = true; this.lastSolvedIv = null; return; }
        this.ivResultText = 'Implied volatility ≈ ' + solved.ivPct.toFixed(2) + '%';
        this.ivResultVisible = true;
        this.lastSolvedIv = solved.ivPct;
    }

    applyIv() {
        if (!this.lastSolvedIv) return;
        this.form.patchValue({ vol: this.lastSolvedIv });
        this.volSource = 'implied';
        this.form.patchValue({ presetKey: 'custom' });
        this.ivResultVisible = false;
    }

    selectCustomKind(kind: InstrumentKind): void {
        this.customKind = kind;
        const params = marketParams(kind);
        this.form.patchValue({ rate: params.riskFreeRate * 100, dividend: params.dividendYield * 100 }, { emitEvent: false });
        this.calculate();
    }

    onSourceTabClick(mode: string) { this.setMode(mode); }
    onSymbolInput(): void {
        const query = String(this.form.value.symbol ?? '').trim().toLowerCase();
        this.filteredSymbols = query ? this.symbols.filter(symbol => symbol.toLowerCase().includes(query)) : this.symbols;
        this.suggestionsOpen = true;
        this.highlightedSymbolIndex = -1;
        this.form.get('presetKey')?.setValue('', { emitEvent: false });
        this.form.get('symbol')?.setErrors(this.symbols.includes(String(this.form.value.symbol)) ? null : { invalidSymbol: true });
    }

    selectSymbol(symbol: string): void {
        this.form.patchValue({ symbol, presetKey: symbol, spotKey: symbol }, { emitEvent: false });
        this.form.get('symbol')?.setErrors(null);
        this.filteredSymbols = [];
        this.suggestionsOpen = false;
        this.highlightedSymbolIndex = -1;
        this.symbolSelection$.next(symbol);
    }

    clearSymbol(): void {
        this.form.patchValue({ symbol: '', presetKey: '', spotKey: '' }, { emitEvent: false });
        this.form.get('symbol')?.setErrors({ required: true });
        this.filteredSymbols = this.symbols;
        this.suggestionsOpen = false;
        this.highlightedSymbolIndex = -1;
        this.symbolDetailsLoading = false;
        this.symbolDetails = null;
        this.expiryDate = '';
        this.closeRequest$.next(null);
        this.strikeOptions = [];
        this.results = {};
        this.inputError = '';
        this.symbolSelection$.next('');
    }

    onSymbolKeydown(event: KeyboardEvent): void {
        if (!this.suggestionsOpen || !this.filteredSymbols.length) {
            if (event.key === 'ArrowDown') this.onSymbolInput();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.highlightedSymbolIndex = (this.highlightedSymbolIndex + 1) % this.filteredSymbols.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.highlightedSymbolIndex = this.highlightedSymbolIndex <= 0 ? this.filteredSymbols.length - 1 : this.highlightedSymbolIndex - 1;
        } else if (event.key === 'Enter' && this.highlightedSymbolIndex >= 0) {
            event.preventDefault();
            this.selectSymbol(this.filteredSymbols[this.highlightedSymbolIndex]);
        } else if (event.key === 'Escape') {
            this.suggestionsOpen = false;
        }
    }

    onSymbolBlur(): void {
        window.setTimeout(() => {
            this.suggestionsOpen = false;
            this.changeDetector.markForCheck();
        }, 150);
    }

    private loadSymbols(): void {
        this.symbolsRequested = true;
        this.svc.getSymbols().pipe(
            takeUntil(this.destroy$),
            catchError(() => {
                this.toast.error('Unable to load symbols. Please refresh and try again.');
                return EMPTY;
            }),
            finalize(() => {
                this.symbolsLoading = false;
                this.changeDetector.markForCheck();
            })
        ).subscribe(symbols => {
            this.symbols = symbols;
            this.filteredSymbols = symbols;
            const initialSymbol = symbols.includes(DefaultStock) ? DefaultStock : symbols[0];
            if (initialSymbol && this.form.value.sourceMode === 'eod') this.selectSymbol(initialSymbol);
        });
    }

    private setupSymbolDetailsLoading(): void {
        this.symbolSelection$.pipe(
            takeUntil(this.destroy$),
            tap(symbol => {
                this.symbolDetailsLoading = Boolean(symbol);
                this.inputError = '';
                this.symbolDetails = null;
                this.expiryDate = '';
                this.closeRequest$.next(null);
            }),
            switchMap(symbol => symbol ? this.svc.getSymbolDetails({ symbol }).pipe(
                tap(details => {
                    this.symbolDetailsLoading = false;
                    this.applySymbolDetails(details);
                }),
                catchError(() => {
                    this.symbolDetailsLoading = false;
                    this.toast.error('Unable to load symbol details. Please try again.');
                    return EMPTY;
                })
            ) : EMPTY)
        ).subscribe(() => this.changeDetector.markForCheck());
    }

    private applySymbolDetails(details: GreeksSymbolDetails): void {
        this.symbolDetails = details;
        const selectedStrike = details.strike.includes(details.atm_strike) ? details.atm_strike : Number(this.form.value.strike);
        const expiryDays = this.resolveExpiryDays(details);
        this.expiryDate = this.firstExpiryDate(details);
        this.strikeOptions = details.strike;
        this.form.patchValue({
            // Stay on the Live tab if it is open (e.g. reopened after sign-in).
            sourceMode: this.form.value.sourceMode === 'live' ? 'live' : 'eod',
            spot: 0, // set from the pricing context (spot index value, or the same-expiry futures close for a stock)
            strike: details.strike.includes(selectedStrike) ? selectedStrike : details.atm_strike,
            expiry: expiryDays,
            strikeKey: String(details.strike.includes(selectedStrike) ? selectedStrike : details.atm_strike),
            ivPrice: null, // filled from the EOD close once the chain for this expiry has loaded
        }, { emitEvent: false });
        this.badgeText = `${details.symbol} · ${details.trade_date} market metadata`;
        this.calculate();
        this.loadClosePrices();
    }

    /**
     * Calendar days from today (IST) to the first listed expiry date (0 on expiry day). The backend's own day counts are not used.
     */
    private resolveExpiryDays(details: GreeksSymbolDetails): number {
        const expiry = this.firstExpiryDate(details);
        const days = expiry ? daysToExpiry(expiry) : Number.NaN;
        return Number.isFinite(days) ? days : 0;
    }

    private firstExpiryDate(details: GreeksSymbolDetails): string {
        const expiry = Array.isArray(details.expiry_date) ? details.expiry_date[0] : details.expiry_date;
        return typeof expiry === 'string' && Number.isFinite(daysToExpiry(expiry)) ? expiry : '';
    }
    onStrikeSelectChange(val: string) { if (val === 'custom') return; this.form.patchValue({ strike: Number(val) }); }
    onIvSrcClick(src: string) { this.form.patchValue({ ivSource: src }); this.autofillIvPrice(); }
}
