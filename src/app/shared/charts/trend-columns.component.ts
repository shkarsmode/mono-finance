import {
    AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, EventEmitter, HostListener, inject, Input,
    OnDestroy, Output, signal, ViewChild,
} from '@angular/core';
import { OTHER_TITLE } from '@core/helpers/category-titles';
import { TrendCategory, TrendMonth } from '@core/services/trends.service';
import {
    axisTick, axisUnit, compactMoney, currencySign, fullMoney, niceTicks, observeWidth, topRoundedBar,
} from './chart-utils';

const HEIGHT = 312;
const M = { top: 24, right: 4, bottom: 36, left: 38 };
const BAR_MAX = 24;
const GAP = 2;
/** Narrower than this, the legend drops its totals — the table under the chart has them. */
const COMPACT = 480;

type Segment = { title: string; color: string; value: number; y: number; h: number; top: boolean };
type Column = { month: TrendMonth; index: number; x: number; total: number; segments: Segment[] };

/**
 * Twelve months of spending as stacked columns: the six biggest categories in their
 * own colours, everything else folded into a gray "Other" on top. Pick a category in
 * the legend and the chart switches to that category alone, drawn from the baseline
 * so its months compare directly. The running month is drawn lighter — it is not
 * over yet.
 */
@Component({
    selector: 'app-trend-columns',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class.compact]': 'compact()' },
    template: `
        <div class="legend" role="group" aria-label="Категорії">
            @for (item of legend(); track item.title) {
                <button type="button" class="chip"
                        [class.chip--on]="selected === item.title"
                        [class.chip--dim]="selected && selected !== item.title"
                        [attr.aria-pressed]="selected === item.title"
                        [disabled]="item.title === OTHER"
                        (click)="toggle(item.title)">
                    <i class="swatch" [style.background]="item.color"></i>
                    <span class="chip__name">{{ item.title }}</span>
                    <span class="chip__val num">{{ fmt(item.total) }}</span>
                </button>
            }
            @if (average() > 0) {
                <span class="avg-key num" title="Середнє за повні місяці — поточний не враховано">
                    <i class="avg-key__line"></i>сер. {{ fmt(average()) }}
                </span>
            }
        </div>

        <div class="plot" #plot (pointerdown)="down($event)" (pointerleave)="leave($event)">
            @if (width() > 0) {
                <svg [attr.width]="width()" [attr.height]="height" role="img"
                     [attr.aria-label]="selected ? 'Витрати по місяцях: ' + selected : 'Витрати по місяцях за категоріями'">
                    <text class="unit" x="0" y="10">{{ unitCaption() }}</text>
                    @for (t of ticks(); track t) {
                        <line class="grid" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="y(t)" [attr.y2]="y(t)" />
                        <text class="tick" [attr.x]="m.left - 6" [attr.y]="y(t)" dy="0.32em" text-anchor="end">{{ tick(t) }}</text>
                    }

                    @for (col of columns(); track col.month.key) {
                        <g class="col" [class.col--partial]="col.month.partial" [class.col--dim]="hover() && hover()!.col !== col.index">
                            <!-- the whole band is the hit target, so the gaps between bars are not dead zones -->
                            <rect class="hit" [attr.x]="col.x - band() / 2" [attr.y]="m.top" [attr.width]="band()" [attr.height]="plotH()"
                                  (pointerenter)="enter($event, col.index, null)"
                                  (click)="tap(col, null)" />
                            @for (seg of col.segments; track seg.title) {
                                <path class="seg" [attr.d]="segPath(col, seg)" [attr.fill]="seg.color"
                                      [class.seg--on]="hover()?.col === col.index && hover()?.seg === seg.title"
                                      (pointerenter)="enter($event, col.index, seg.title)"
                                      (click)="tap(col, seg.title)" />
                            }
                        </g>
                        @if (labeled().has(col.index)) {
                            <text class="tick tick--x" [attr.x]="col.x" [attr.y]="height - m.bottom + 15" text-anchor="middle">{{ col.month.label }}</text>
                        }
                        @if (yearAt().has(col.index)) {
                            <text class="tick tick--year" [attr.x]="col.x" [attr.y]="height - m.bottom + 29" text-anchor="middle">{{ col.month.year }}</text>
                        }
                    }

                    @if (average() > 0) {
                        <line class="avg" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="y(average())" [attr.y2]="y(average())" />
                    }
                </svg>

                @if (hovered(); as h) {
                    <div class="tip" [style.left.px]="tipLeft(h.col)" [style.top.px]="12">
                        <div class="tip__head">
                            <span>{{ h.col.month.name }} {{ h.col.month.year }}</span>
                            @if (h.col.month.partial) { <span class="tip__so">поки що</span> }
                        </div>
                        @if (!selected && h.seg; as s) {
                            <div class="tip__row"><i class="key" [style.background]="s.color"></i><b class="num">{{ money(s.value) }}</b><span>{{ s.title }} · {{ share(s.value, h.col.total) }}%</span></div>
                        }
                        <div class="tip__row tip__row--total"><b class="num">{{ money(h.col.total) }}</b><span>{{ selected ? selected : 'усього витрачено' }}</span></div>
                        <div class="tip__hint">{{ touch() ? 'торкніться ще раз, щоб відкрити місяць' : 'клікніть, щоб відкрити місяць' }}</div>
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
            gap: var(--space-2);
            margin-bottom: var(--space-3);
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            height: 28px;
            padding: 0 var(--space-3);
            border: 1px solid var(--line);
            border-radius: var(--radius-full);
            background: var(--surface);
            color: var(--ink-2);
            font: inherit;
            font-size: var(--fs-micro);
            cursor: pointer;
            transition: border-color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);

            &:hover:not(:disabled) { border-color: var(--line-2); color: var(--ink); }
            &:disabled { cursor: default; }
            &--on { border-color: var(--ink); color: var(--ink); font-weight: 600; }
            &--dim { opacity: .55; }
        }

        .chip__name { white-space: nowrap; }
        .chip__val { color: var(--ink-3); }

        .avg-key {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 28px;
            padding: 0 var(--space-1);
            color: var(--ink-3);
            font-size: var(--fs-micro);
            white-space: nowrap;
        }

        .avg-key__line { width: 14px; border-top: 1px solid var(--ink-3); }

        :host(.compact) .legend { gap: 6px; }
        :host(.compact) .chip { height: 26px; padding: 0 var(--space-2); gap: 6px; }
        :host(.compact) .chip__val { display: none; }

        .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }

        .plot { position: relative; }
        svg { display: block; overflow: visible; }

        .grid { stroke: var(--line); stroke-width: 1; }
        .tick { fill: var(--ink-3); font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
        .tick--x { font-family: var(--font-ui); font-size: 11px; }
        .tick--year { font-family: var(--font-ui); font-size: 10px; opacity: .75; }
        .unit { fill: var(--ink-3); font-size: 10px; }

        .hit { fill: transparent; cursor: pointer; }
        .seg { cursor: pointer; transition: opacity var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease); }
        .seg--on { filter: brightness(1.08) saturate(1.1); }
        .col--partial .seg { opacity: .45; }
        .col--dim .seg { opacity: .35; }
        .col--dim.col--partial .seg { opacity: .2; }

        .avg { stroke: var(--ink-3); stroke-width: 1; pointer-events: none; }

        .tip {
            position: absolute;
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
        .tip__hint { margin-top: 4px; color: var(--ink-3); font-size: 10px; }
    `],
})
export class TrendColumnsComponent implements AfterViewInit, OnDestroy {
    @Input() public set months(value: TrendMonth[]) { this.months_.set(value ?? []); }
    @Input() public set categories(value: TrendCategory[]) { this.categories_.set(value ?? []); }
    /** Titles that own a colour, in slot order. */
    @Input() public set slots(value: Array<string | null>) { this.slots_.set(value ?? []); }
    @Input() public set selectedCategory(value: string | null) { this.selected_.set(value); }
    @Input() public currency = 980;
    /** Resolves a category title to its app-wide colour. */
    @Input() public colorFor: (title: string) => string = () => 'var(--series-other)';

    @Output() public readonly selectCategory = new EventEmitter<string | null>();
    @Output() public readonly openMonth = new EventEmitter<{ year: number; month: number }>();

    @ViewChild('plot') private readonly plotRef!: ElementRef<HTMLElement>;
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    /** Trailing space: the fold can never clash with a real category of the same name. */
    public readonly OTHER = `${OTHER_TITLE} `;
    public readonly height = HEIGHT;
    public readonly m = M;
    public readonly width = signal(0);
    public readonly hover = signal<{ col: number; seg: string | null } | null>(null);
    /** The last pointer was a finger: no hover, so the first tap shows a month and the second opens it. */
    public readonly touch = signal(false);
    public readonly compact = computed(() => this.width() > 0 && this.width() < COMPACT);

    private readonly months_ = signal<TrendMonth[]>([]);
    private readonly categories_ = signal<TrendCategory[]>([]);
    private readonly slots_ = signal<Array<string | null>>([]);
    private readonly selected_ = signal<string | null>(null);
    private stopObserving?: () => void;

    public get selected(): string | null { return this.selected_(); }

    public readonly plotH = computed(() => HEIGHT - M.top - M.bottom);
    public readonly band = computed(() => (this.width() - M.left - M.right) / Math.max(1, this.months_().length));
    private readonly barW = computed(() => Math.min(BAR_MAX, Math.max(8, this.band() * 0.62)));

    /** The colour-owning categories present in the data, in slot order (bottom of the stack first). */
    private readonly stackOrder = computed(() => {
        const present = new Set(this.categories_().map(c => c.title));
        return this.slots_().filter((t): t is string => !!t && present.has(t));
    });

    public readonly legend = computed(() => {
        const categories = this.categories_();
        const items = this.stackOrder().map(title => ({
            title,
            color: this.colorFor(title),
            total: categories.find(c => c.title === title)?.total ?? 0,
        }));
        const colored = new Set(this.stackOrder());
        const otherTotal = categories.filter(c => !colored.has(c.title)).reduce((sum, c) => sum + c.total, 0);
        if (otherTotal > 0) items.push({ title: this.OTHER, color: 'var(--series-other)', total: otherTotal });
        return items;
    });

    /** Per-month values for every stack entry, "Other" last. */
    private readonly series = computed(() => {
        const categories = this.categories_();
        const n = this.months_().length;
        const selected = this.selected_();
        if (selected) {
            const one = categories.find(c => c.title === selected);
            return [{ title: selected, color: this.colorFor(selected), values: one?.perMonth ?? Array(n).fill(0) }];
        }
        const order = this.stackOrder();
        const out = order.map(title => ({
            title,
            color: this.colorFor(title),
            values: categories.find(c => c.title === title)?.perMonth ?? Array(n).fill(0),
        }));
        const colored = new Set(order);
        const other = Array(n).fill(0);
        for (const c of categories) if (!colored.has(c.title)) c.perMonth.forEach((v, i) => (other[i] += v));
        if (other.some(v => v > 0)) out.push({ title: this.OTHER, color: 'var(--series-other)', values: other });
        return out;
    });

    private readonly totals = computed(() => {
        const n = this.months_().length;
        const totals = Array(n).fill(0);
        for (const s of this.series()) s.values.forEach((v, i) => (totals[i] += v));
        return totals;
    });

    public readonly ticks = computed(() => niceTicks(Math.max(1, ...this.totals()), 4));
    private readonly unit = computed(() => axisUnit(this.ticks()[this.ticks().length - 1]));
    public readonly unitCaption = computed(() => [this.unit().unit, currencySign(this.currency)].filter(Boolean).join(' '));

    /**
     * Columns that carry a month label: all of them while three letters fit, else every
     * other one counted back from this month (Ukrainian initials would be ambiguous —
     * С is both січень and серпень).
     */
    public readonly labeled = computed(() => {
        const n = this.months_().length;
        const every = this.band() >= 28 ? 1 : 2;
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

    /** Average of the FULL months — the running one would drag it down. */
    public readonly average = computed(() => {
        const totals = this.totals().slice(0, -1);
        return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    });

    public readonly columns = computed<Column[]>(() => {
        const months = this.months_();
        const series = this.series();
        const top = this.ticks()[this.ticks().length - 1] || 1;
        const plotH = this.plotH();
        return months.map((month, index) => {
            const x = M.left + this.band() * (index + 0.5);
            let base = HEIGHT - M.bottom;
            const stacked = series.filter(s => s.values[index] > 0);
            const segments: Segment[] = stacked.map((s, k) => {
                const full = (s.values[index] / top) * plotH;
                const isTop = k === stacked.length - 1;
                // a 2px surface gap separates touching segments; the top one keeps its full height
                const h = Math.max(1, full - (isTop ? 0 : GAP));
                const y = base - full;
                base -= full;
                return { title: s.title, color: s.color, value: s.values[index], y: isTop ? y : y + GAP, h, top: isTop };
            });
            return { month, index, x, total: series.reduce((sum, s) => sum + s.values[index], 0), segments };
        });
    });

    public readonly hovered = computed(() => {
        const h = this.hover();
        if (!h) return null;
        const col = this.columns()[h.col];
        if (!col) return null;
        return { col, seg: h.seg ? col.segments.find(s => s.title === h.seg) ?? null : null };
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
        if (this.hover() && !this.host.nativeElement.contains(event.target as Node)) this.hover.set(null);
    }

    public down(event: PointerEvent): void {
        this.touch.set(event.pointerType === 'touch');
    }

    public enter(event: PointerEvent, col: number, seg: string | null): void {
        if (event.pointerType === 'touch') return;   // a finger "enters" on every tap; the tap decides
        this.hover.set({ col, seg });
    }

    public leave(event: PointerEvent): void {
        if (event.pointerType !== 'touch') this.hover.set(null);
    }

    public tap(col: Column, seg: string | null): void {
        if (this.touch() && this.hover()?.col !== col.index) {
            this.hover.set({ col: col.index, seg });
            return;
        }
        this.openMonth.emit({ year: col.month.year, month: col.month.month });
    }

    public tick(value: number): string {
        return axisTick(value, this.unit().div);
    }

    public y(value: number): number {
        const top = this.ticks()[this.ticks().length - 1] || 1;
        return HEIGHT - M.bottom - (value / top) * this.plotH();
    }

    public segPath(col: Column, seg: Segment): string {
        const w = this.barW();
        const x = col.x - w / 2;
        // only the topmost segment carries the rounded data end
        return seg.top ? topRoundedBar(x, seg.y, w, seg.h, 4) : `M${x},${seg.y}h${w}v${seg.h}h${-w}Z`;
    }

    public toggle(title: string): void {
        if (title === this.OTHER) return;
        this.selectCategory.emit(this.selected_() === title ? null : title);
    }

    public fmt(minor: number): string { return compactMoney(minor); }
    public money(minor: number): string { return fullMoney(minor, currencySign(this.currency)); }
    public share(value: number, total: number): number { return total > 0 ? Math.round((value / total) * 100) : 0; }

    public tipLeft(col: Column): number {
        return Math.min(Math.max(col.x, 96), this.width() - 96);
    }
}
