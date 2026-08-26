import { Injectable } from '@angular/core';
import {
    HistoricalVolatilityInstrument,
    HistoricalVolatilityInstrumentKey,
    HistoricalVolatilityPricePoint,
} from './historical-volatility.model';

@Injectable({ providedIn: 'root' })
export class HistoricalVolatilityService {
    private readonly instruments: Record<HistoricalVolatilityInstrumentKey, HistoricalVolatilityInstrument> = {
        nifty: { label: 'NIFTY 50', spot: 24800, volatility: 0.125, seed: 1001 },
        banknifty: { label: 'BANK NIFTY', spot: 51200, volatility: 0.140, seed: 1002 },
        sensex: { label: 'SENSEX', spot: 81400, volatility: 0.120, seed: 1003 },
        reliance: { label: 'Reliance Industries', spot: 2950, volatility: 0.220, seed: 1004 },
        tcs: { label: 'TCS', spot: 3850, volatility: 0.200, seed: 1005 },
        hdfcbank: { label: 'HDFC Bank', spot: 1680, volatility: 0.185, seed: 1006 },
        infosys: { label: 'Infosys', spot: 1550, volatility: 0.240, seed: 1007 },
    };

    getInstrument(key: HistoricalVolatilityInstrumentKey): HistoricalVolatilityInstrument {
        return this.instruments[key];
    }

    getInstrumentOptions(): Array<{ key: HistoricalVolatilityInstrumentKey; label: string }> {
        return (Object.keys(this.instruments) as HistoricalVolatilityInstrumentKey[]).map(key => ({
            key,
            label: this.instruments[key].label,
        }));
    }

    loadSeries(key: HistoricalVolatilityInstrumentKey): HistoricalVolatilityPricePoint[] {
        const instrument = this.instruments[key];
        const random = this.mulberry32(instrument.seed);
        const count = 60;
        const dailyVolatility = instrument.volatility / Math.sqrt(252);
        const returns = Array.from({ length: count - 1 }, () => dailyVolatility * this.randomNormal(random));
        const totalReturn = returns.reduce((sum, value) => sum + value, 0);
        let price = instrument.spot * Math.exp(-totalReturn);
        const dates: Date[] = [];
        let date = this.lastTradingDay(new Date());

        for (let index = 0; index < count; index += 1) {
            dates.unshift(new Date(date));
            date = this.previousTradingDay(date);
        }

        const series: HistoricalVolatilityPricePoint[] = [{
            date: this.formatDate(dates[0]),
            close: Number(price.toFixed(2)),
        }];

        returns.forEach((dailyReturn, index) => {
            price *= Math.exp(dailyReturn);
            series.push({ date: this.formatDate(dates[index + 1]), close: Number(price.toFixed(2)) });
        });

        return series;
    }

    calculateReturns(series: HistoricalVolatilityPricePoint[]): Array<number | null> {
        return series.map((point, index) => index === 0 ? null : Math.log(point.close / series[index - 1].close));
    }

    rollingVolatility(returns: Array<number | null>, index: number, window: number): number | null {
        if (index - window + 1 < 1) return null;
        const values = returns.slice(index - window + 1, index + 1).filter((value): value is number => value !== null);
        if (values.length !== window) return null;
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
        return Math.sqrt(variance) * Math.sqrt(252) * 100;
    }

    private mulberry32(seed: number): () => number {
        return () => {
            seed |= 0;
            seed = (seed + 0x6D2B79F5) | 0;
            let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    private randomNormal(random: () => number): number {
        const first = Math.max(random(), 1e-9);
        const second = random();
        return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    }

    private lastTradingDay(date: Date): Date {
        const result = new Date(date);
        if (result.getDay() === 0) result.setDate(result.getDate() - 2);
        else if (result.getDay() === 6) result.setDate(result.getDate() - 1);
        return result;
    }

    private previousTradingDay(date: Date): Date {
        const result = new Date(date);
        do {
            result.setDate(result.getDate() - 1);
        } while (result.getDay() === 0 || result.getDay() === 6);
        return result;
    }

    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }
}
