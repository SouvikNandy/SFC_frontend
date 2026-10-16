import { EodDataRow } from '../eod/eod.model';

export type LegOptionType = 'CE' | 'PE';
export type RangePreset = '1W' | '1M' | '3M' | 'Custom';
export type LegStatus = 'loading' | 'ready' | 'error';

/** One option leg picked by the user. `strike` is null until the instrument's strikes are known. */
export interface LegSelection {
    id: number;
    optionType: LegOptionType;
    strike: number | null;
    /** YYYY-MM-DD, one of the instrument's listed expiries. */
    expiry: string;
}

/** A leg together with the EOD bars the backend returned for it. */
export interface LegSeries {
    leg: LegSelection;
    label: string;
    status: LegStatus;
    /** Oldest first. */
    rows: EodDataRow[];
}

/** One trading session across all legs; a leg with no bar that day has null (not listed / expired / no data). */
export interface SessionRow {
    date: string;
    bars: Array<EodDataRow | null>;
}

export interface DateRange {
    from: string;
    till: string;
}

export interface LegChartLine {
    index: number;
    label: string;
    path: string;
    /** Points plotted for this leg (used to show a marker for single sessions). */
    dots: Array<{ x: number; y: number }>;
}

export interface LegChartGeometry {
    viewBox: string;
    width: number;
    padLeft: number;
    plotWidth: number;
    plotTop: number;
    plotBottom: number;
    yTicks: Array<{ y: number; label: string }>;
    xTicks: Array<{ x: number; label: string }>;
    lines: LegChartLine[];
    /** X position of each session, for hover. */
    xs: number[];
}

export interface CombinedTableRow {
    date: string;
    closes: Array<number | null>;
    /** Close minus that leg's previous available close; null when missing or first. */
    changes: Array<number | null>;
}

export interface SingleLegTableRow {
    date: string;
    bar: EodDataRow | null;
    change: number | null;
}
