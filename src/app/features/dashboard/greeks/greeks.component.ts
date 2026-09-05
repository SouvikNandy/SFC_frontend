import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EMPTY, Subject, catchError, finalize, switchMap, takeUntil, tap } from 'rxjs';
import { GreeksCalculatorService, GreeksInput } from './greeks-calculator.service';
import { GreeksSymbolDetails } from './greeks.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-greeks',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './greeks.component.html',
    styleUrls: ['./greeks.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GreeksComponent implements OnInit, OnDestroy {
    form: ReturnType<FormBuilder['group']>;

    strikeOptions: number[] = [];
    results: Partial<ReturnType<GreeksCalculatorService['calculateAll']> & { markerLeft: number; moneynessText: string }> = {};
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
    historicalVolatility20: number | null = null;
    symbolDetails: GreeksSymbolDetails | null = null;
    private readonly symbolSelection$ = new Subject<string>();
    private readonly destroy$ = new Subject<void>();
    private lastSolvedIv: number | null = null;

    constructor(private fb: FormBuilder, public svc: GreeksCalculatorService, private readonly toast: ToastService, private readonly changeDetector: ChangeDetectorRef) {
        this.form = this.fb.group({
            sourceMode: ['eod'],
            symbol: ['', Validators.required],
            presetKey: [''],
            spotKey: [''],
            spot: [24800, [Validators.required, Validators.min(0.0001)]],
            strikeKey: ['24800'],
            strike: [24800, [Validators.required, Validators.min(0.0001)]],
            rate: [10, Validators.required],
            vol: [12.5, Validators.required],
            expiry: [7, Validators.required],
            dividend: [10, Validators.required],
            ivType: ['call'],
            ivPrice: [null],
            ivSource: ['auto']
        });
    }

    ngOnInit() {
        this.loadSymbols();
        this.setupSymbolDetailsLoading();
        // subscribe individually to replicate prototype 'input' behaviour and sync logic
        const spotCtrl = this.form.get('spot')!;
        const strikeCtrl = this.form.get('strike')!;
        const rateCtrl = this.form.get('rate')!;
        const volCtrl = this.form.get('vol')!;
        const expiryCtrl = this.form.get('expiry')!;
        const dividendCtrl = this.form.get('dividend')!;

        const manualChange = () => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            this.calculate();
            this.autofillIvPrice();
        };

        spotCtrl.valueChanges.subscribe((val: number) => {
            // emulate prototype: mark preset custom, update strike select chain and spotSelect if matching
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            const spot = Number(val) || 0;
            this.populateStrikeOptions(spot, this.niceStep(spot), Number(this.form.value.strike));
            this.form.patchValue({ spotKey: 'custom' }, { emitEvent: false });
            this.calculate();
            this.autofillIvPrice();
        });

        strikeCtrl.valueChanges.subscribe((val: number) => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            const opts = this.strikeOptions.map(s => String(s));
            const v = String(val);
            this.form.patchValue({ strikeKey: opts.includes(v) ? v : 'custom' }, { emitEvent: false });
            this.calculate();
            this.autofillIvPrice();
        });

        [rateCtrl, volCtrl, expiryCtrl, dividendCtrl].forEach(ctrl => ctrl.valueChanges.subscribe(() => manualChange()));
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

    populateStrikeOptions(spot: number, step: number, selected?: number) {
        this.strikeOptions = this.buildStrikeChain(spot, step);
    }

    setMode(mode: string) {
        this.form.patchValue({ sourceMode: mode });
        // reset badge text when switching modes
        this.badgeText = '';
        if (mode === 'custom') {
            this.form.patchValue({ presetKey: 'custom' });
            // enable inputs for manual mode
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
        } else if (mode === 'eod') {
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
        } else if (mode === 'live') {
            // disable inputs in live lock
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.disable());
        }
    }

    autofillIvPrice() {
        const mode = this.form.value.sourceMode;
        const ivSrc = this.form.value.ivSource;
        if (mode === 'custom' || ivSrc !== 'auto') return;
        const S = Number(this.form.value.spot);
        const K = Number(this.form.value.strike);
        const r = Number(this.form.value.rate) / 100;
        const q = Number(this.form.value.dividend) / 100;
        const sigma = Number(this.form.value.vol) / 100;
        const days = Number(this.form.value.expiry);
        const T = Math.max(days, 0.0001) / 365;
        if ([S, K, r, q, sigma].some(v => isNaN(v)) || S <= 0 || K <= 0 || sigma <= 0) return;
        const type = this.form.value.ivType;
        const price = this.svc.bsPrice(type, S, K, r, q, T, sigma);
        this.form.patchValue({ ivPrice: parseFloat(price.toFixed(2)) });
    }

    calculate() {
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
        const T = Math.max(days, 0.0001) / 365;
        const type = this.form.value.ivType;
        const marketPrice = Number(this.form.value.ivPrice);
        if (isNaN(marketPrice) || marketPrice <= 0) { this.ivResultText = 'Enter a market price first'; this.ivResultVisible = true; return; }
        const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
        if (marketPrice < intrinsic * Math.exp(-r * T)) {
            this.ivResultText = 'Price is below intrinsic value — check your inputs'; this.ivResultVisible = true; return;
        }
        const iv = this.svc.impliedVolatility(type, marketPrice, S, K, r, q, T);
        this.ivResultText = 'Implied volatility ≈ ' + (iv * 100).toFixed(2) + '%';
        this.ivResultVisible = true;
        this.lastSolvedIv = iv * 100;
    }

    applyIv() {
        if (!this.lastSolvedIv) return;
        this.form.patchValue({ vol: this.lastSolvedIv });
        this.form.patchValue({ presetKey: 'custom' });
        this.ivResultVisible = false;
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
        });
    }

    private setupSymbolDetailsLoading(): void {
        this.symbolSelection$.pipe(
            takeUntil(this.destroy$),
            tap(() => {
                this.symbolDetailsLoading = true;
                this.inputError = '';
                this.symbolDetails = null;
                this.historicalVolatility20 = null;
            }),
            switchMap(symbol => this.svc.getSymbolDetails({ symbol }).pipe(
                tap(details => {
                    this.symbolDetailsLoading = false;
                    this.applySymbolDetails(details);
                }),
                catchError(() => {
                    this.symbolDetailsLoading = false;
                    this.toast.error('Unable to load symbol details. Please try again.');
                    return EMPTY;
                })
            ))
        ).subscribe(() => this.changeDetector.markForCheck());
    }

    private applySymbolDetails(details: GreeksSymbolDetails): void {
        this.symbolDetails = details;
        this.historicalVolatility20 = details.hv20?.hv20 ?? null;
        const selectedStrike = details.strike.includes(details.atm_strike) ? details.atm_strike : Number(this.form.value.strike);
        const expiryDays = this.daysBetween(details.trade_date, details.expiry_date);
        this.strikeOptions = details.strike;
        this.form.patchValue({
            sourceMode: 'eod',
            spot: details.underlying,
            strike: details.strike.includes(selectedStrike) ? selectedStrike : details.atm_strike,
            expiry: expiryDays,
            vol: details.hv20?.hv20 ?? this.form.value.vol,
            strikeKey: String(details.strike.includes(selectedStrike) ? selectedStrike : details.atm_strike),
            ivPrice: this.form.value.ivType === 'put' ? details.market_price?.PE ?? null : details.market_price?.CE ?? null,
        }, { emitEvent: false });
        this.badgeText = `${details.symbol} · ${details.trade_date} market metadata`;
        this.calculate();
    }

    private daysBetween(from: string, to: string): number {
        const fromTime = this.parseApiDate(from);
        const toTime = this.parseApiDate(to);
        return Math.max(1, Math.round((toTime - fromTime) / 86400000));
    }

    private parseApiDate(value: string): number {
        const [year, month, day] = value.split('-').map(Number);
        return Date.UTC(year, month - 1, day);
    }
    onStrikeSelectChange(val: string) { if (val === 'custom') return; this.form.patchValue({ strike: Number(val) }); }
    onIvSrcClick(src: string) { this.form.patchValue({ ivSource: src }); this.autofillIvPrice(); }
    onLiveUpgrade() { /* stub - no backend */ this.inputError = 'Upgrade request sent'; }
}
