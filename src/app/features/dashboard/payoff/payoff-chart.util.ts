/*
 * SVG geometry for the payoff chart and strike ladder. Pure layout only;
 * every P&L value comes from the PayoffResult computed by payoff-engine.ts.
 * Dimensions and layout rules follow prototype/payoff-tool-pro_11.html.
 */
import { addDays } from './payoff-engine';
import {
    ChartLabel,
    ChartLine,
    LadderPill,
    LadderTone,
    PayoffChart,
    PayoffLadder,
    PayoffLeg,
    PayoffResult,
} from './payoff.model';

export const formatRupee = (value: number) => '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function buildPayoffChart(result: PayoffResult, legs: PayoffLeg[], spot: number, narrow: boolean): PayoffChart {
    const width = narrow ? 340 : 1060, height = narrow ? 300 : 390;
    const padLeft = narrow ? 36 : 54, padRight = narrow ? 10 : 26, padTop = narrow ? 18 : 26, padBottom = narrow ? 24 : 32;
    const plotWidth = width - padLeft - padRight, plotHeight = height - padTop - padBottom, plotBottom = padTop + plotHeight;
    const expiry = result.curveExpiry, evaluation = result.curveEval;
    const lo = expiry[0].price, hi = expiry[expiry.length - 1].price;
    const showEval = result.evalDay < result.near;

    const values = [...expiry.map(p => p.pnl), ...evaluation.map(p => p.pnl)];
    let yMin = Math.min(...values), yMax = Math.max(...values);
    if (yMax === yMin) { yMax += 1; yMin -= 1; }
    const pad = (yMax - yMin) * 0.13;
    yMin -= pad; yMax += pad;
    const xAt = (price: number) => padLeft + ((price - lo) / (hi - lo)) * plotWidth;
    const yAt = (value: number) => padTop + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;
    const zeroY = Math.max(padTop, Math.min(plotBottom, yAt(0)));
    const f1 = (n: number) => n.toFixed(1);

    const densityMax = Math.max(...result.densities) || 1;
    const densityPath = `M${padLeft},${plotBottom} ` + expiry.map((p, i) =>
        `L${f1(xAt(p.price))},${f1(plotBottom - (result.densities[i] / densityMax) * plotHeight * 0.62)}`).join(' ') +
        ` L${width - padRight},${plotBottom} Z`;
    const band = (clamp: (y: number) => number) => `M${padLeft},${f1(zeroY)} ` +
        expiry.map(p => `L${f1(xAt(p.price))},${f1(clamp(yAt(p.pnl)))}`).join(' ') + ` L${width - padRight},${f1(zeroY)} Z`;
    const line = (curve: typeof expiry) => curve.map((p, i) => `${i ? 'L' : 'M'}${f1(xAt(p.price))},${f1(yAt(p.pnl))}`).join(' ');

    const gridLines: ChartLine[] = [], yLabels: ChartLabel[] = [];
    const yTicks = narrow ? 4 : 5;
    for (let g = 0; g <= yTicks; g++) {
        const value = yMin + (yMax - yMin) * g / yTicks, y = yAt(value);
        gridLines.push({ x1: padLeft, y1: y, x2: width - padRight, y2: y });
        yLabels.push({ x: padLeft - 7, y: y + 3.5, anchor: 'end',
            text: Math.abs(value) >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0) });
    }
    const xLabels: ChartLabel[] = [];
    const xTicks = narrow ? 3 : 7;
    for (let i = 0; i < xTicks; i++) {
        const price = lo + (hi - lo) * i / (xTicks - 1);
        const anchor = narrow ? (i === 0 ? 'start' : i === xTicks - 1 ? 'end' : 'middle') : 'middle';
        xLabels.push({ x: xAt(price), y: height - 9, anchor, text: formatRupee(Math.round(price)) });
    }
    const visibleBreakevens = result.breakevens.filter(b => b >= lo && b <= hi);
    const breakevenLines = visibleBreakevens.map(b => ({ x1: xAt(b), y1: padTop, x2: xAt(b), y2: plotBottom }));
    // On a phone the breakeven labels collide; the values are listed in the summary strip.
    const breakevenLabels = narrow ? [] : placeBreakevenLabels(visibleBreakevens.map(xAt), visibleBreakevens,
        padTop, padLeft, width - padRight, 9.5);
    const strikeMarks = Array.from(new Set(legs.map(leg => leg.strike)))
        .filter(k => k >= lo && k <= hi)
        .map(k => ({ x1: xAt(k), y1: plotBottom - 7, x2: xAt(k), y2: plotBottom }));

    return {
        width, height, viewBox: `0 0 ${width} ${height}`, fontSize: narrow ? 10.5 : 9.5, padLeft, padTop, plotWidth, plotBottom, zeroY,
        gridLines, yLabels, xLabels, densityPath,
        profitPath: band(y => Math.min(y, zeroY)),
        lossPath: band(y => Math.max(y, zeroY)),
        expiryPath: line(expiry),
        evalPath: showEval ? line(evaluation) : null,
        breakevenLines, breakevenLabels, strikeMarks,
        spotX: Math.max(padLeft, Math.min(width - padRight, xAt(spot))),
        points: expiry.map((p, i) => ({
            price: p.price, x: xAt(p.price),
            pnlExpiry: p.pnl, pnlEval: evaluation[i].pnl,
            yExpiry: yAt(p.pnl), yEval: yAt(evaluation[i].pnl),
        })),
    };
}

/**
 * Breakeven price labels above the plot. Close breakevens (e.g. calendar spreads) would print on top of
 * each other, so labels are packed greedily into two rows; a label that fits neither row is dropped
 * (its line stays, and every value is listed in the Breakevens summary card).
 */
function placeBreakevenLabels(xs: number[], values: number[], padTop: number, minX: number, maxX: number, fontSize: number): ChartLabel[] {
    const rows = [padTop - 8, padTop - 12 - fontSize];
    const rowEnds = rows.map(() => -Infinity);
    const gap = 6;
    const labels: ChartLabel[] = [];
    xs.forEach((x, i) => {
        const text = formatRupee(Math.round(values[i]));
        const width = text.length * fontSize * 0.62;
        // Keep the label inside the plot: anchor to the edge when centring would overflow.
        const anchor: ChartLabel['anchor'] = x - width / 2 < minX ? 'start' : x + width / 2 > maxX ? 'end' : 'middle';
        const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
        const row = rowEnds.findIndex(end => left >= end + gap);
        if (row < 0) return;
        rowEnds[row] = left + width;
        labels.push({ x, y: rows[row], anchor, text });
    });
    return labels;
}

export function buildStrikeLadder(result: PayoffResult, legs: PayoffLeg[], spot: number, strikeStep: number,
    baseDate: Date, narrow: boolean): PayoffLadder {
    const width = narrow ? 340 : 1100, padLeft = narrow ? 10 : 26, padRight = narrow ? 10 : 26;
    const { lo, hi, near, usedExpiries } = result;
    const xAt = (price: number) => padLeft + ((price - lo) / (hi - lo)) * (width - padLeft - padRight);

    // Merge legs that share strike + type + expiry into one pill.
    const groups: Array<{ strike: number; type: PayoffLeg['type']; expiryDays: number; qty: number }> = [];
    legs.forEach(leg => {
        const signed = leg.quantity * (leg.direction === 'long' ? 1 : -1);
        const group = groups.find(g => g.strike === leg.strike && g.type === leg.type && g.expiryDays === leg.expiryDays);
        if (group) group.qty += signed;
        else groups.push({ strike: leg.strike, type: leg.type, expiryDays: leg.expiryDays, qty: signed });
    });

    const pillH = narrow ? 21 : 19, badgeH = narrow ? 14 : 13, rowGap = 6, gapX = narrow ? 4 : 7;
    const rowStep = pillH + badgeH + rowGap;
    const items = groups.map(g => {
        const qtyTag = Math.abs(g.qty) > 1 ? '×' + Math.abs(g.qty) : '';
        const label = Math.round(g.strike).toLocaleString('en-IN') + (g.type === 'call' ? 'C' : 'P') + (qtyTag ? ' ' + qtyTag : '');
        const tone: LadderTone = `${g.qty < 0 ? 'short' : 'long'}-${g.type}`;
        return {
            ...g, label, tone, row: 0,
            w: Math.max(narrow ? 42 : 52, label.length * (narrow ? 6.6 : 7.0) + (narrow ? 10 : 16)),
            x: xAt(g.strike),
            above: !(g.expiryDays === near && usedExpiries.length > 1),
        };
    }).filter(item => item.x >= padLeft - 30 && item.x <= width - padRight + 30);

    // Greedy row packing so pills never overlap.
    const pack = (list: typeof items) => {
        list.sort((a, b) => a.x - b.x);
        const rows: Array<Array<[number, number]>> = [];
        list.forEach(item => {
            const half = item.w / 2;
            let r = 0;
            for (; ; r++) {
                if (!rows[r]) rows[r] = [];
                const clash = rows[r].some(span => !(item.x + half + gapX <= span[0] || item.x - half - gapX >= span[1]));
                if (!clash) { rows[r].push([item.x - half, item.x + half]); break; }
            }
            item.row = r;
        });
        return rows.length;
    };
    const rowsAbove = pack(items.filter(i => i.above)), rowsBelow = pack(items.filter(i => !i.above));
    const axisPad = 30;
    const axisY = Math.max(rowsAbove, 1) * rowStep + axisPad;
    const height = axisY + Math.max(rowsBelow, 1) * rowStep + axisPad;

    // Axis ticks every strike step; guard against pathological custom inputs.
    let step = strikeStep > 0 ? strikeStep : (hi - lo) / 20;
    if ((hi - lo) / step > 400) step *= Math.ceil((hi - lo) / step / 400);
    const labelEvery = Math.max(step, Math.round((hi - lo) / (narrow ? 4 : 9) / step) * step);
    const ticks: PayoffLadder['ticks'] = [], labels: ChartLabel[] = [];
    for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) {
        const x = xAt(k), major = Math.abs(k / labelEvery - Math.round(k / labelEvery)) < 1e-9;
        ticks.push({ x1: x, y1: axisY - (major ? 7 : 4), x2: x, y2: axisY + (major ? 7 : 4), major });
        // Edge labels would be clipped by the viewBox, so they are skipped.
        if (major && x >= padLeft + 16 && x <= width - padRight - 16) labels.push({ x, y: axisY + 21, anchor: 'middle', text: Math.round(k).toLocaleString('en-IN') });
    }
    const sx = xAt(spot);
    const f1 = (n: number) => n.toFixed(1);
    const badgeW = narrow ? 34 : 32;

    const pills: LadderPill[] = items.map(item => {
        const offset = axisPad + item.row * rowStep;
        const y = item.above ? axisY - offset - pillH : axisY + offset;
        const cx = Math.max(padLeft + item.w / 2, Math.min(width - padRight - item.w / 2, item.x));
        const anchorY = item.above ? y + pillH : y;
        const midY = (anchorY + axisY) / 2;
        // Elbow connector when the pill had to shift sideways; it always points at the true strike.
        const connector = Math.abs(cx - item.x) < 0.6
            ? `M${f1(item.x)},${f1(anchorY)} L${f1(item.x)},${axisY}`
            : `M${f1(cx)},${f1(anchorY)} L${f1(cx)},${f1(midY)} L${f1(item.x)},${f1(midY)} L${f1(item.x)},${axisY}`;
        const badgeY = item.above ? y - badgeH - 2 : y + pillH + 2;
        const expiryDate = addDays(baseDate, item.expiryDays);
        return {
            key: `${item.strike}-${item.type}-${item.expiryDays}`,
            label: item.label, tone: item.tone, near: item.expiryDays === near,
            x: cx - item.w / 2, cx, y, width: item.w, height: pillH, textY: y + pillH * 0.71, connector,
            badgeX: cx - badgeW / 2, badgeY, badgeWidth: badgeW, badgeHeight: badgeH, badgeTextY: badgeY + badgeH * 0.74,
            badgeText: `${expiryDate.getMonth() + 1}/${expiryDate.getDate()}`,
        };
    });

    return {
        viewBox: `0 0 ${width} ${height}`, axisY, axisX1: padLeft, axisX2: width - padRight, ticks, labels,
        spotMarker: `${sx - 5},${axisY - 12} ${sx + 5},${axisY - 12} ${sx},${axisY - 4}`,
        pills, tickFont: narrow ? 11.5 : 10, pillFont: narrow ? 11.5 : 11, badgeFont: narrow ? 9 : 8.5,
    };
}
