import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { GreeksCalculatorService, PRESETS, GreeksInput } from './greeks-calculator.service';

@Component({
    selector: 'app-greeks',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './greeks.component.html',
    styleUrls: ['./greeks.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GreeksComponent implements OnInit {
    form: any;

    presets = PRESETS;
    spotOptions: Array<{ key: string, label: string }> = [];
    strikeOptions: number[] = [];
    results: any = {};
    inputError = '';
    ivResultText = '';
    ivResultVisible = false;
    badgeText = '';
    private suppressStrikeSync = false;
    private suppressSpotSync = false;

    constructor(private fb: FormBuilder, public svc: GreeksCalculatorService) {
        this.form = this.fb.group({
            sourceMode: ['eod'],
            presetKey: ['nifty'],
            spotKey: ['nifty'],
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

    get presetKeys(): string[] { return Object.keys(this.presets); }
    presetLabel(key?: string | null) { return key && this.presets[key] ? this.presets[key]!.label : null; }

    ngOnInit() {
        this.populateSpotOptions();
        this.applyPreset(String(this.form.value.presetKey || 'nifty'));
        // subscribe individually to replicate prototype 'input' behaviour and sync logic
        const spotCtrl = this.form.get('spot');
        const strikeCtrl = this.form.get('strike');
        const rateCtrl = this.form.get('rate');
        const volCtrl = this.form.get('vol');
        const expiryCtrl = this.form.get('expiry');
        const dividendCtrl = this.form.get('dividend');

        const manualChange = () => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            this.calculate(false);
            this.autofillIvPrice();
        };

        spotCtrl.valueChanges.subscribe((val: number) => {
            // emulate prototype: mark preset custom, update strike select chain and spotSelect if matching
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            if (!this.suppressStrikeSync) {
                const spot = Number(val) || 0;
                this.populateStrikeOptions(spot, this.niceStep(spot), Number(this.form.value.strike));
                if (!this.suppressSpotSync) {
                    const match = Object.keys(this.presets).find(k => k !== 'custom' && this.presets[k]!.spot === spot);
                    this.form.patchValue({ spotKey: match || 'custom' }, { emitEvent: false });
                }
            }
            this.calculate(false);
            this.autofillIvPrice();
        });

        strikeCtrl.valueChanges.subscribe((val: number) => {
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Manual entry — edit any field below';
            if (!this.suppressStrikeSync) {
                const opts = this.strikeOptions.map(s => String(s));
                const v = String(val);
                this.form.patchValue({ strikeKey: opts.includes(v) ? v : 'custom' }, { emitEvent: false });
            }
            this.calculate(false);
            this.autofillIvPrice();
        });

        [rateCtrl, volCtrl, expiryCtrl, dividendCtrl].forEach(ctrl => ctrl.valueChanges.subscribe(() => manualChange()));
    }

    populateSpotOptions() {
        this.spotOptions = Object.keys(this.presets).filter(k => k !== 'custom').map(k => ({ key: k, label: this.presets[k]!.label.split(' · ')[0] + ' — ₹' + this.presets[k]!.spot.toLocaleString('en-IN') }));
        this.spotOptions.push({ key: 'custom', label: 'Custom price…' });
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
            this.applyPreset('custom');
            // enable inputs for manual mode
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
        } else if (mode === 'eod') {
            const key = this.form.value.presetKey || 'nifty';
            this.applyPreset(key);
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.enable());
        } else if (mode === 'live') {
            // disable inputs in live lock
            ['spot', 'strike', 'rate', 'vol', 'expiry', 'dividend', 'ivType'].forEach((c: string) => this.form.get(c)?.disable());
        }
    }

    applyPreset(key: string) {
        const p = this.presets[key];
        if (!p) {
            // manual
            this.populateStrikeOptions(this.form.value.spot, this.niceStep(this.form.value.spot));
            return;
        }
        this.form.patchValue({ spot: p.spot, strike: p.strike, rate: p.rate, vol: p.vol, expiry: p.expiry, dividend: p.dividend, presetKey: key, spotKey: key });
        this.populateStrikeOptions(p.spot, p.step);
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

    calculate(userTriggered = true) {
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
        (this.results as any).markerLeft = pct;
        (this.results as any).moneynessText = this.svc.fmt(this.svc.normCdf(r.d2) * 100, 1) + '% ITM probability' + ((ratio <= 1.003 && ratio >= 0.997) ? ' (ATM)' : '');
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
        (this.ivResultText as any);
        // store iv for apply
        (this as any)._lastSolvedIv = iv * 100;
    }

    applyIv() {
        if (!(this as any)._lastSolvedIv) return;
        this.form.patchValue({ vol: (this as any)._lastSolvedIv });
        this.form.patchValue({ presetKey: 'custom' });
        this.calculate();
        this.ivResultVisible = false;
    }

    onSourceTabClick(mode: string) { this.setMode(mode); }
    onPresetChange(key: string) { this.applyPreset(key); }
    onSpotSelect(key: string) {
        if (key === 'custom') return;
        const p = this.presets[key];
        if (p) {
            // prototype behaviour: underlying price from preset but other fields left as-is
            this.suppressSpotSync = true;
            this.form.patchValue({ spot: p.spot, spotKey: key }, { emitEvent: true });
            this.suppressSpotSync = false;
            this.populateStrikeOptions(p.spot, p.step, Number(this.form.value.strike));
            this.form.patchValue({ presetKey: 'custom' }, { emitEvent: false });
            this.badgeText = 'Underlying price from ' + p.label.split(' · ')[0] + ' — other fields left as-is';
        }
    }
    onStrikeSelectChange(val: string) { if (val === 'custom') return; this.form.patchValue({ strike: Number(val) }); }
    onIvSrcClick(src: string) { this.form.patchValue({ ivSource: src }); this.autofillIvPrice(); }
    onCalcClick() { this.calculate(true); }
    onLiveUpgrade() { /* stub - no backend */ this.inputError = 'Upgrade request sent'; }
}
