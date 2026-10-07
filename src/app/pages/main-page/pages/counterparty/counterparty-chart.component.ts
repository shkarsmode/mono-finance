import {
    AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, EventEmitter, HostListener, inject, Input,
    OnDestroy, Output, signal, ViewChild,
} from '@angular/core';
import {
    axisTick, axisUnit, currencySign, fullMoney, niceTicks, observeWidth, topRoundedBar,
} from '../../../../shared/charts/chart-utils';

export interface CounterpartyMonth {
    /** «2026-10» — also the anchor of the month in the list below. */
    key: string;
    year: number;
    month: number;
    /** Short, for the axis: «Жов». */
    label: string;
    /** Full, for the tooltip: «Жовтень». */
    name: string;
    /** The running month — drawn lighter, it is not over yet. */
    partial: boolean;
    /** Minor units of the display currency, both as positive numbers. */
    received: number;
    spent: number;
    count: number;
}

const HEIGHT = 260;
const M = { top: 22, right: 4, bottom: 36, left: 40 };
const BAR_MAX = 18;
/** Surface between the baseline and a bar, so the baseline stays readable. */
const GAP = 1;
/** A month with any money in it never disappears into a hairline. */
const MIN_BAR = 2;

type Column = { month: CounterpartyMonth; index: number; x: number; inPath: string; outPath: string };

/** A rect with only its BOTTOM corners rounded — the data end of a bar that hangs below the baseline. */
function bottomRoundedBar(x: number, y: number, w: number, h: number, r = 4): string {
    if (h <= 0 || w <= 0) return '';
    const radius = Math.min(r, w / 2, h);
    return [
        `M${x},${y}`,
        `H${x + w}`,
        `V${y + h - radius}`,
        `Q${x + w},${y + h} ${x + w - radius},${y + h}`,
        `H${x + radius}`,
        `Q${x},${y + h} ${x},${y + h - radius}`,
        'Z',
    ].join(' ');
}

/** Ukrainian plural: 1 операція, 2–4 операції, 5+ операцій (11–14 take the last form). */
function plural(n: number, forms: readonly [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

/**
 * Money exchanged with one party, month by month, as diverging columns: what came
 * from them rises above the baseline in green, what went to them hangs below it in
 * red, both on one scale. A month with nothing is a gap. The running month is
 * lighter. Clicking a month asks the page to show its operations.
 */
@Component({
    selector: 'app-counterparty-chart',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="legend" aria-hidden="true">
            @if (hasIn()) { <span class="legend__key"><i class="swatch swatch--in"></i>Прийшло від них</span> }
            @if (hasOut()) { <span class="legend__key"><i class="swatch swatch--out"></i>Пішло на них</span> }
        </div>

        <div class="plot" #plot (pointerdown)="down($event)" (pointerleave)="leave($event)">
            @if (width() > 0) {
                <svg [attr.width]="width()" [attr.height]="height" role="img" aria-label="Скільки прийшло від них і скільки пішло на них, по місяцях">
                    <text class="unit" x="0" y="10">{{ unitCaption() }}</text>
                    @for (t of scale().ticks; track t) {
                        <line class="grid" [class.grid--zero]="t === 0" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="y(t)" [attr.y2]="y(t)" />
                        <text class="tick" [attr.x]="m.left - 6" [attr.y]="y(t)" dy="0.32em" text-anchor="end">{{ tick(t) }}</text>
                    }

                    @for (col of columns(); track col.month.key) {
                        <g class="col"
                           [class.col--partial]="col.month.partial"
                           [class.col--dim]="hover() !== null && hover() !== col.index"
                           [class.col--empty]="!col.month.count"
                           (pointerenter)="enter($event, col.index)"
                           (click)="tap(col)">
                            <!-- the whole band is the hit target, so the gaps between bars are not dead zones -->
                            <rect class="hit" [attr.x]="col.x - band() / 2" [attr.y]="m.top" [attr.width]="band()" [attr.height]="plotH" />
                            @if (col.inPath) { <path class="bar bar--in" [attr.d]="col.inPath" /> }
                            @if (col.outPath) { <path class="bar bar--out" [attr.d]="col.outPath" /> }
                        </g>
                        @if (labeled().has(col.index)) {
                            <text class="tick tick--x" [attr.x]="col.x" [attr.y]="height - m.bottom + 15" text-anchor="middle">{{ col.month.label }}</text>
                        }
                        @if (yearAt().has(col.index)) {
                            <text class="tick tick--year" [attr.x]="col.x" [attr.y]="height - m.bottom + 29" text-anchor="middle">{{ col.month.year }}</text>
                        }
                    }
                </svg>

                @if (hovered(); as h) {
                    <div class="tip" [style.left.px]="tipLeft(h)">
                        <div class="tip__head">
                            <span>{{ h.month.name }} {{ h.month.year }}</span>
                            @if (h.month.partial) { <span class="tip__so">поки що</span> }
                        </div>
                        @if (h.month.count) {
                            @if (hasIn()) {
                                <div class="tip__row"><i class="key key--in"></i><b class="num">{{ signed(h.month.received) }}</b><span>прийшло</span></div>
                            }
                            @if (hasOut()) {
                                <div class="tip__row"><i class="key key--out"></i><b class="num">{{ signed(-h.month.spent) }}</b><span>пішло</span></div>
                            }
                            <div class="tip__row tip__row--total"><span class="num">{{ countLabel(h.month.count) }}</span></div>
                            <div class="tip__hint">{{ touch() ? 'торкніться ще раз, щоб перейти до операцій' : 'клікніть, щоб перейти до операцій' }}</div>
                        } @else {
                            <div class="tip__none">Операцій не було</div>
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: [`
        :host { display: block; }

        .legend {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-1) var(--space-4);
            margin-bottom: var(--space-3);
            font-size: var(--fs-micro);
            color: var(--ink-2);
        }

        .legend__key { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }

        .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
        .swatch--in { background: var(--pos); }
        .swatch--out { background: var(--neg); }

        .plot { position: relative; }
        svg { display: block; overflow: visible; }

        .grid { stroke: var(--line); stroke-width: 1; }
        .grid--zero { stroke: var(--line-2); }
        .tick { fill: var(--ink-3); font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
        .tick--x { font-family: var(--font-ui); font-size: 11px; }
        .tick--year { font-family: var(--font-ui); font-size: 10px; opacity: .75; }
        .unit { fill: var(--ink-3); font-size: 10px; }

        .col { cursor: pointer; }
        .col--empty { cursor: default; }
        .hit { fill: transparent; }
        .bar { transition: opacity var(--dur-fast) var(--ease); }
        .bar--in { fill: var(--pos); }
        .bar--out { fill: var(--neg); }
        .col--partial .bar { opacity: .45; }
        .col--dim .bar { opacity: .35; }
        .col--dim.col--partial .bar { opacity: .2; }

        .tip {
            position: absolute;
            top: 8px;
            transform: translateX(-50%);
            pointer-events: none;
            min-width: 168px;
            padding: var(--space-2) var(--space-3);
            background: var(--surface);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-pop);
            font-size: var(--fs-micro);
            z-index: 2;
        }

        .tip__head {
            display: flex;
            justify-content: space-between;
            gap: var(--space-2);
            margin-bottom: 4px;
            color: var(--ink-2);
            font-weight: 600;
        }

        .tip__so { color: var(--ink-3); font-weight: 500; }

        .tip__row {
            display: flex;
            align-items: center;
            gap: 6px;
            b { color: var(--ink); font-weight: 600; }
            span { color: var(--ink-3); }

            &--total { margin-top: 2px; padding-top: 4px; border-top: 1px solid var(--line); }
        }

        .key { width: 10px; height: 2px; border-radius: 1px; flex: none; }
        .key--in { background: var(--pos); }
        .key--out { background: var(--neg); }
        .tip__none { color: var(--ink-3); }
        .tip__hint { margin-top: 4px; color: var(--ink-3); font-size: 10px; }
    `],
})
export class CounterpartyChartComponent implements AfterViewInit, OnDestroy {
    @Input() public set months(value: CounterpartyMonth[]) { this.months_.set(value ?? []); }
    /** The display currency the amounts are in. */
    @Input() public currency = 980;

    /** The key of a month whose operations should be shown. */
    @Output() public readonly openMonth = new EventEmitter<string>();

    @ViewChild('plot') private readonly plotRef!: ElementRef<HTMLElement>;
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    public readonly height = HEIGHT;
    public readonly m = M;
    public readonly plotH = HEIGHT - M.top - M.bottom;
    public readonly width = signal(0);
    public readonly hover = signal<number | null>(null);
    /** The last pointer was a finger: no hover, so the first tap shows a month and the second opens it. */
    public readonly touch = signal(false);

    private readonly months_ = signal<CounterpartyMonth[]>([]);
    private stopObserving?: () => void;

    public readonly hasIn = computed(() => this.months_().some(m => m.received > 0));
    public readonly hasOut = computed(() => this.months_().some(m => m.spent > 0));

    public readonly band = computed(() => (this.width() - M.left - M.right) / Math.max(1, this.months_().length));
    private readonly barW = computed(() => Math.min(BAR_MAX, Math.max(4, this.band() * 0.62)));

    /**
     * One linear scale for both sides: the step comes from the whole range, and each
     * side reaches the first gridline at or above its own biggest month — a party
     * you mostly pay does not get an empty half for the money that came back.
     */
    public readonly scale = computed(() => {
        const months = this.months_();
        const hi = Math.max(0, ...months.map(m => m.received));
        const lo = Math.max(0, ...months.map(m => m.spent));
        if (!(hi + lo > 0)) return { up: 1, down: 0, ticks: [0] };
        const base = niceTicks(hi + lo, 5);
        const step = base.length > 1 ? base[1] - base[0] : hi + lo;
        const nUp = Math.ceil(hi / step - 1e-9);
        const nDown = Math.ceil(lo / step - 1e-9);
        const ticks: number[] = [];
        for (let k = -nDown; k <= nUp; k++) ticks.push(k * step);
        return { up: nUp * step, down: nDown * step, ticks };
    });

    private readonly unit = computed(() => axisUnit(Math.max(this.scale().up, this.scale().down)));
    public readonly unitCaption = computed(() => [this.unit().unit, currencySign(this.currency)].filter(Boolean).join(' '));

    /**
     * Columns that carry a month label: as many as fit without touching, counted back
     * from this month so the running one is always named.
     */
    public readonly labeled = computed(() => {
        const n = this.months_().length;
        const band = this.band();
        const every = band >= 28 ? 1 : band >= 14 ? 2 : band >= 9 ? 3 : 6;
        const out = new Set<number>();
        for (let i = n - 1; i >= 0; i -= every) out.add(i);
        return out;
    });

    /** The year goes under the first labelled month of each year, unless it would crowd the next one. */
    public readonly yearAt = computed(() => {
        const months = this.months_();
        const marks: number[] = [];
        let year: number | null = null;
        for (const i of [...this.labeled()].sort((a, b) => a - b)) {
            if (months[i].year !== year) {
                marks.push(i);
                year = months[i].year;
            }
        }
        if (marks.length > 1 && (marks[1] - marks[0]) * this.band() < 40) marks.shift();
        return new Set(marks);
    });

    public readonly columns = computed<Column[]>(() => {
        const band = this.band();
        const w = this.barW();
        const zero = this.y(0);
        return this.months_().map((month, index) => {
            const x = M.left + band * (index + 0.5);
            const left = x - w / 2;
            let inPath = '';
            let outPath = '';
            if (month.received > 0) {
                const h = Math.max(MIN_BAR, zero - GAP - this.y(month.received));
                inPath = topRoundedBar(left, zero - GAP - h, w, h, 3);
            }
            if (month.spent > 0) {
                const h = Math.max(MIN_BAR, this.y(-month.spent) - zero - GAP);
                outPath = bottomRoundedBar(left, zero + GAP, w, h, 3);
            }
            return { month, index, x, inPath, outPath };
        });
    });

    public readonly hovered = computed(() => {
        const i = this.hover();
        return i === null ? null : this.columns()[i] ?? null;
    });

    public ngAfterViewInit(): void {
        this.stopObserving = observeWidth(this.plotRef.nativeElement, w => this.width.set(w));
    }

    public ngOnDestroy(): void {
        this.stopObserving?.();
    }

    /** A tap anywhere else puts the tooltip away — a finger never "leaves" the chart. */
    @HostListener('document:pointerdown', ['$event'])
    public outside(event: PointerEvent): void {
        if (this.hover() !== null && !this.host.nativeElement.contains(event.target as Node)) this.hover.set(null);
    }

    public down(event: PointerEvent): void {
        this.touch.set(event.pointerType === 'touch');
    }

    public enter(event: PointerEvent, index: number): void {
        if (event.pointerType === 'touch') return;   // a finger "enters" on every tap; the tap decides
        this.hover.set(index);
    }

    public leave(event: PointerEvent): void {
        if (event.pointerType !== 'touch') this.hover.set(null);
    }

    public tap(col: Column): void {
        if (this.touch() && this.hover() !== col.index) {
            this.hover.set(col.index);
            return;
        }
        if (!col.month.count) return;
        this.hover.set(null);
        this.openMonth.emit(col.month.key);
    }

    public y(value: number): number {
        const { up, down } = this.scale();
        return M.top + ((up - value) / (up + down || 1)) * this.plotH;
    }

    /** Both sides are labelled by size; the side says the direction. */
    public tick(value: number): string {
        return axisTick(Math.abs(value), this.unit().div);
    }

    public signed(minor: number): string {
        const text = fullMoney(minor, currencySign(this.currency));
        return minor > 0 ? `+${text}` : text;
    }

    public countLabel(n: number): string {
        return `${n} ${plural(n, ['операція', 'операції', 'операцій'])}`;
    }

    public tipLeft(col: Column): number {
        return Math.min(Math.max(col.x, 92), this.width() - 92);
    }
}
