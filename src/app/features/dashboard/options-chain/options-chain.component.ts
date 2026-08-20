import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OptionsChainService } from './options-chain.service';

type RawRow = number[];
type ProcessedRow = {
    raw: RawRow;
    strike: string;
    strikeShort: string;
    ceOI: string; ceChgOI: string; ceChgOIColor: string; ceVol: string; ceIV: string; ceLTP: string; ceChg: string; ceChgColor: string;
    peOI: string; peChgOI: string; peChgOIColor: string; peVol: string; peIV: string; peLTP: string; peChg: string; peChgColor: string;
    isAtm: boolean; ceBarPct: number; peBarPct: number; cx: number; ceCy: number; peCy: number; ceDelta: string; peDelta: string;
};

@Component({
    selector: 'app-options-chain',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
  <section class="sfc-page-pad options-chain-page">
    <div class="chain-head">
      <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
        <div style="display:flex;gap:4px;background:var(--panel-alt);border-radius:8px;padding:4px">
          <button class="seg-btn" [class.active]="symbol==='NIFTY'" (click)="selectSymbol('NIFTY')">NIFTY</button>
          <button class="seg-btn" [class.active]="symbol==='BANKNIFTY'" (click)="selectSymbol('BANKNIFTY')">BANKNIFTY</button>
        </div>
        <div>
          <div class="muted small-label">Expiry</div>
          <select class="expiry-select">
            <option>31 Jul 2026 (Weekly)</option>
            <option>07 Aug 2026 (Weekly)</option>
            <option>28 Aug 2026 (Monthly)</option>
          </select>
        </div>
        <div>
          <div class="muted small-label">Spot price</div>
          <div style="display:flex;align-items:baseline;gap:8px">
            <div class="num spot-val">{{ fmt(dataset?.spot) }}</div>
            <div class="num spot-change" [style.color]="dataset?.spotChg >= 0 ? 'var(--teal)' : 'var(--red)'">{{ signed(dataset?.spotChg) }} ({{ signed(dataset?.spotChgPct, '%') }})</div>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        <label class="muted small-label"><input type="checkbox" [(ngModel)]="showGreeks"> Show Greeks</label>
        <button class="btn-export" (click)="downloadCsv()">Download CSV</button>
      </div>
    </div>

    <div class="sfc-grid-5 metrics-row">
      <div class="stat-card"><div class="muted small-label">Put/Call Ratio</div><div class="num stat-val">{{ pcr }}</div></div>
      <div class="stat-card"><div class="muted small-label">Max Pain</div><div class="num stat-val">{{ fmtInt(atmStrike) }}</div></div>
      <div class="stat-card"><div class="muted small-label">Total Call OI</div><div class="num stat-val" style="color:var(--teal)">{{ fmtInt(totalCe * 1000) }}</div></div>
      <div class="stat-card"><div class="muted small-label">Total Put OI</div><div class="num stat-val" style="color:var(--red)">{{ fmtInt(totalPe * 1000) }}</div></div>
      <div class="stat-card"><div class="muted small-label">ATM IV</div><div class="num stat-val">{{ atmIv }}</div></div>
    </div>

    <div class="chain-panel">
      <div class="sfc-table-wrap">
        <table [style.minWidth.px]="showGreeks ? 1040 : 920">
          <thead>
            <tr class="group-head">
              <th [attr.colspan]="showGreeks ? 7 : 6" class="calls">Calls</th>
              <th class="strike-col"></th>
              <th [attr.colspan]="showGreeks ? 7 : 6" class="puts">Puts</th>
            </tr>
            <tr>
              <th *ngIf="showGreeks" class="muted small-label">Delta</th>
              <th class="muted small-label">OI</th>
              <th class="muted small-label">Chg OI</th>
              <th class="muted small-label">Volume</th>
              <th class="muted small-label">IV</th>
              <th class="muted small-label">LTP</th>
              <th class="muted small-label">Chg%</th>
              <th class="muted small-label strike-col">Strike</th>
              <th class="muted small-label">Chg%</th>
              <th class="muted small-label">LTP</th>
              <th class="muted small-label">IV</th>
              <th class="muted small-label">Volume</th>
              <th class="muted small-label">Chg OI</th>
              <th class="muted small-label">OI</th>
              <th *ngIf="showGreeks" class="muted small-label">Delta</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows" [ngClass]="{ 'atm-row': r.isAtm }">
              <td *ngIf="showGreeks" class="num">{{ r.ceDelta }}</td>
              <td class="num">{{ r.ceOI }}</td>
              <td class="num" [style.color]="r.ceChgOIColor">{{ r.ceChgOI }}</td>
              <td class="num">{{ r.ceVol }}</td>
              <td class="num">{{ r.ceIV }}</td>
              <td class="num">{{ r.ceLTP }}</td>
              <td class="num" [style.color]="r.ceChgColor">{{ r.ceChg }}</td>
              <td class="strike num">{{ r.strike }}</td>
              <td class="num" [style.color]="r.peChgColor">{{ r.peChg }}</td>
              <td class="num">{{ r.peLTP }}</td>
              <td class="num">{{ r.peIV }}</td>
              <td class="num">{{ r.peVol }}</td>
              <td class="num" [style.color]="r.peChgOIColor">{{ r.peChgOI }}</td>
              <td class="num">{{ r.peOI }}</td>
              <td *ngIf="showGreeks" class="num">{{ r.peDelta }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="sfc-grid-2 charts-row">
      <div class="oi-chart card">
        <div class="card-head">Open Interest by Strike</div>
        <div class="legend"><span class="legend-call"></span>Call OI <span class="legend-put"></span>Put OI</div>
        <div class="oi-bars" role="img" aria-label="Open interest bars">
            <div *ngFor="let r of rows" class="oi-col">
            <div class="bar call" [style.height.%]="r.ceBarPct"></div>
            <div class="bar put" [style.height.%]="r.peBarPct"></div>
          </div>
        </div>
        <div class="oi-labels"><div *ngFor="let r of rows" class="oi-label num">{{ r.strikeShort }}</div></div>
      </div>

      <div class="iv-smile card">
        <div class="card-head">Implied Volatility Smile</div>
        <svg viewBox="0 0 560 200" width="100%" height="200" preserveAspectRatio="none">
          <line x1="0" y1="199" x2="560" y2="199" stroke="var(--border)" stroke-width="1"></line>
          <path [attr.d]="ceIvPath" fill="none" stroke="var(--teal)" stroke-width="2.5"></path>
          <path [attr.d]="peIvPath" fill="none" stroke="var(--red)" stroke-width="2.5"></path>
          <g *ngFor="let c of circles">
            <circle [attr.cx]="c.cx" [attr.cy]="c.cy" r="3" [attr.fill]="c.fill"></circle>
          </g>
        </svg>
        <div class="oi-labels"><div *ngFor="let r of rows" class="oi-label num">{{ r.strikeShort }}</div></div>
      </div>
    </div>
  </section>
  `,
    styleUrls: ['./options-chain.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptionsChainComponent {
    private readonly svc = inject(OptionsChainService);
    symbol = 'NIFTY';
    dataset: any = null;
    rows: ProcessedRow[] = [];
    showGreeks = false;
    pcr = '';
    atmStrike = 0;
    totalCe = 0;
    totalPe = 0;
    atmIv = '';
    ceIvPath = '';
    peIvPath = '';
    circles: Array<{ cx: number, cy: number, fill: string }> = [];

    constructor() {
        this.load(this.symbol);
    }

    load(sym: string) {
        const d = this.svc.getDataset(sym);
        if (!d) return;
        this.dataset = d;
        const rows = this.buildRows(d);
        this.rows = rows;
        this.totalCe = d.rows.reduce((s, r) => s + r[1], 0);
        this.totalPe = d.rows.reduce((s, r) => s + r[7], 0);
        this.pcr = (this.totalPe / this.totalCe).toFixed(2);
        this.atmStrike = d.atmStrike;
        const atm = d.rows.find(r => r[0] === d.atmStrike) || d.rows[Math.floor(d.rows.length / 2)];
        this.atmIv = (((atm[4] + atm[10]) / 2)).toFixed(1) + '%';
        // build paths
        this.ceIvPath = this.buildPath(rows, 'ceCy');
        this.peIvPath = this.buildPath(rows, 'peCy');
        this.circles = rows.map(r => ({ cx: r.cx, cy: r.ceCy, fill: 'var(--teal)' })).concat(rows.map(r => ({ cx: r.cx, cy: r.peCy, fill: 'var(--red)' })));
    }

    selectSymbol(sym: string) { this.symbol = sym; this.load(sym); }

    // formatting helpers
    fmt(n?: number) { if (n === undefined || n === null) return ''; return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    fmtInt(n?: number) { if (n === undefined || n === null) return ''; return Math.round(n).toLocaleString('en-IN'); }
    signed(n?: number, suffix?: string) { if (n === undefined || n === null) return ''; return (n >= 0 ? '+' : '') + (typeof n === 'number' ? n.toFixed(2) : n) + (suffix || ''); }

    // Build processed rows similar to prototype buildRows
    buildRows(d: any): ProcessedRow[] {
        const cols = ['strike', 'ceOI', 'ceChgOI', 'ceVol', 'ceIV', 'ceLTP', 'ceChg', 'peOI', 'peChgOI', 'peVol', 'peIV', 'peLTP', 'peChg'];
        const raw = d.rows.map((r: RawRow) => { const o: any = {}; cols.forEach((c, i) => o[c] = r[i]); return o; });
        const maxOI = Math.max(...raw.map((r: any) => Math.max(r.ceOI, r.peOI)));
        const allIV = raw.flatMap((r: any) => [r.ceIV, r.peIV]);
        const minIV = Math.min(...allIV), maxIV = Math.max(...allIV);
        const chartW = 560, chartH = 200, padTop = 14, padBot = 4;
        const n = raw.length;
        const ivY = (v: number) => padTop + (1 - (v - minIV) / (maxIV - minIV)) * (chartH - padTop - padBot);
        const cx = (i: number) => ((i + 0.5) / n * chartW);

        return raw.map((r: any, i: number) => {
            const isAtm = r.strike === d.atmStrike;
            const ceChg = r.ceChg;
            const peChg = r.peChg;
            const ceChgColor = ceChg >= 0 ? 'var(--teal)' : 'var(--red)';
            const peChgColor = peChg >= 0 ? 'var(--teal)' : 'var(--red)';
            const ceChgOIColor = r.ceChgOI >= 0 ? 'var(--teal)' : 'var(--red)';
            const peChgOIColor = r.peChgOI >= 0 ? 'var(--teal)' : 'var(--red)';
            const processed: ProcessedRow = {
                raw: r,
                strike: this.fmtInt(r.strike),
                strikeShort: (r.strike / 100).toFixed(0) + '00',
                ceOI: this.fmtInt(r.ceOI * 1000),
                ceChgOI: (r.ceChgOI >= 0 ? '+' : '') + r.ceChgOI.toFixed(1) + 'K',
                ceChgOIColor: ceChgOIColor,
                ceVol: this.fmtInt(r.ceVol * 1000),
                ceIV: r.ceIV.toFixed(1) + '%',
                ceLTP: this.fmt(r.ceLTP),
                ceChg: (r.ceChg >= 0 ? '+' : '') + r.ceChg.toFixed(1) + '%',
                ceChgColor: ceChgColor,
                peOI: this.fmtInt(r.peOI * 1000),
                peChgOI: (r.peChgOI >= 0 ? '+' : '') + r.peChgOI.toFixed(1) + 'K',
                peChgOIColor: peChgOIColor,
                peVol: this.fmtInt(r.peVol * 1000),
                peIV: r.peIV.toFixed(1) + '%',
                peLTP: this.fmt(r.peLTP),
                peChg: (r.peChg >= 0 ? '+' : '') + r.peChg.toFixed(1) + '%',
                peChgColor: peChgColor,
                isAtm: isAtm,
                ceBarPct: parseFloat((r.ceOI / maxOI * 100).toFixed(1)),
                peBarPct: parseFloat((r.peOI / maxOI * 100).toFixed(1)),
                cx: cx(i),
                ceCy: ivY(r.ceIV),
                peCy: ivY(r.peIV),
                ceDelta: this.blackScholes(d.spot, r.strike, 12, r.ceIV, 6.5, 'CE').delta.toFixed(3),
                peDelta: this.blackScholes(d.spot, r.strike, 12, r.peIV, 6.5, 'PE').delta.toFixed(3)
            };
            return processed;
        });
    }

    buildPath(rows: ProcessedRow[], key: 'ceCy' | 'peCy') {
        return rows.map((r, i) => (i === 0 ? 'M' : 'L') + r.cx.toFixed(1) + ',' + (r as any)[key].toFixed(1)).join(' ');
    }

    // Minimal Black-Scholes helpers ported from prototype
    normPdf(x: number) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
    normCdf(x: number) {
        const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419;
        const t = 1 / (1 + p * Math.abs(x));
        const poly = b1 * t + b2 * t * t + b3 * t ** 3 + b4 * t ** 4 + b5 * t ** 5;
        const cdf = 1 - this.normPdf(x) * poly;
        return x >= 0 ? cdf : 1 - cdf;
    }
    blackScholes(S: number, K: number, days: number, ivPct: number, ratePct: number, type: 'CE' | 'PE') {
        const T = Math.max(days, 0.1) / 365;
        const sigma = Math.max(ivPct, 0.1) / 100;
        const r = ratePct / 100;
        const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        const isCall = type === 'CE';
        const price = isCall
            ? S * this.normCdf(d1) - K * Math.exp(-r * T) * this.normCdf(d2)
            : K * Math.exp(-r * T) * this.normCdf(-d2) - S * this.normCdf(-d1);
        const delta = isCall ? this.normCdf(d1) : this.normCdf(d1) - 1;
        return { price, delta };
    }

    downloadCsv() {
        const d = this.dataset;
        if (!d) return;
        const header = 'Strike,CE_OI,CE_ChgOI,CE_Vol,CE_IV,CE_LTP,CE_Chg%,PE_OI,PE_ChgOI,PE_Vol,PE_IV,PE_LTP,PE_Chg%\n';
        const body = d.rows.map((r: any) => r.join(',')).join('\n');
        const blob = new Blob([header + body], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${this.symbol}_option_chain.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
}

