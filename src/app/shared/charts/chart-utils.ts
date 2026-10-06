/**
 * Small, dependency-free helpers for the SVG charts. Everything here is pure so it
 * can be tested and reused; the charts themselves stay thin.
 */

/** Clean axis ticks: 0 and 3–5 round steps (1·2·2.5·5·10 × 10ⁿ) that cover `max`. */
export function niceTicks(max: number, target = 4): number[] {
    if (!(max > 0)) return [0];
    const rough = max / target;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= rough) ?? 10 * power;
    const ticks: number[] = [];
    for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v * 100) / 100);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
}

/** Axis and tooltip-friendly amounts from MINOR units: 1 250 · 12,4 тис. · 1,2 млн */
export function compactMoney(minor: number): string {
    const major = Math.abs(minor) / 100;
    const sign = minor < 0 ? '−' : '';
    if (major >= 1_000_000) return `${sign}${trim(major / 1_000_000)} млн`;
    if (major >= 10_000) return `${sign}${trim(major / 1_000, major >= 100_000 ? 0 : 1)} тис.`;
    return `${sign}${Math.round(major).toLocaleString('uk-UA')}`;
}

function trim(value: number, digits = 1): string {
    return value.toLocaleString('uk-UA', { maximumFractionDigits: digits });
}

/**
 * One unit for a whole axis, so the ticks read "0 · 25 · 50 · 75" under a single
 * "тис. ₴" caption instead of repeating "тис." on every line. `top` is the highest
 * tick in minor units.
 */
export function axisUnit(top: number): { div: number; unit: string } {
    const major = Math.abs(top) / 100;
    if (major >= 1_000_000) return { div: 100_000_000, unit: 'млн' };
    if (major >= 10_000) return { div: 100_000, unit: 'тис.' };
    return { div: 100, unit: '' };
}

export function axisTick(minor: number, div: number): string {
    return (minor / div).toLocaleString('uk-UA', { maximumFractionDigits: 1 });
}

/** Full amount for tooltips and tables: 12 480 ₴ */
export function fullMoney(minor: number, currencySign = '₴'): string {
    const major = Math.round(Math.abs(minor) / 100);
    return `${minor < 0 ? '−' : ''}${major.toLocaleString('uk-UA')} ${currencySign}`;
}

export function currencySign(code: number): string {
    return code === 840 ? '$' : code === 978 ? '€' : code === 985 ? 'zł' : '₴';
}

/**
 * A rect with only its top corners rounded — the data end. The baseline stays
 * square, as every bar grows from one shared baseline.
 */
export function topRoundedBar(x: number, y: number, w: number, h: number, r = 4): string {
    if (h <= 0 || w <= 0) return '';
    const radius = Math.min(r, w / 2, h);
    return [
        `M${x},${y + h}`,
        `V${y + radius}`,
        `Q${x},${y} ${x + radius},${y}`,
        `H${x + w - radius}`,
        `Q${x + w},${y} ${x + w},${y + radius}`,
        `V${y + h}`,
        'Z',
    ].join(' ');
}

/**
 * Watch an element's width; returns a disconnect function. The current width is
 * reported at once — ResizeObserver only delivers on a rendering frame, so a chart
 * created in a background tab would otherwise stay blank until the tab is shown.
 */
export function observeWidth(element: Element, onWidth: (width: number) => void): () => void {
    const initial = Math.floor(element.getBoundingClientRect().width);
    if (initial > 0) onWidth(initial);
    const observer = new ResizeObserver(entries => {
        const width = Math.floor(entries[0]?.contentRect.width ?? 0);
        if (width > 0) onWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
}
