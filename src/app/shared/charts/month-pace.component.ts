import {
    AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, Input, OnDestroy, signal,
    ViewChild,
} from '@angular/core';
import { ITransaction } from '@core/interfaces';
import { TrendsService } from '@core/services/trends.service';
import { axisTick, axisUnit, compactMoney, currencySign, fullMoney, niceTicks, observeWidth } from './chart-utils';

const HEIGHT = 180;
const M = { top: 22, right: 44, bottom: 24, left: 34 };

/**
 * This month against your usual month, as cumulative spending by day. One line is
 * the point (this month, accent), the other is context (the average of the six
 * months before, gray). The line stops at today — no flat tail into the future.
 */
@Component({
    selector: 'app-month-pace',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="pace">
            <header class="pace__head">
                <h3 class="pace__title">Темп витрат</h3>
                @if (verdict(); as v) {
                    <span class="pace__verdict" [class.pace__verdict--up]="v.delta > 0.03" [class.pace__verdict--down]="v.delta < -0.03">
                        {{ v.text }}
                    </span>
                }
            </header>
            <p class="pace__sub num">
                @if (running()) {
                    {{ total() }} наразі
                    @if (usual()) { <span>· зазвичай на {{ lastDay() }}-й день: {{ usualAtToday() }}</span> }
                } @else {
                    {{ total() }} витрачено
                    @if (usual()) { <span>· звичайний місяць: {{ usualAtToday() }}</span> }
                }
            </p>

            <div class="pace__plot" #plot (pointerleave)="leave($event)">
                @if (width() > 0 && actual(); as a) {
                    <svg [attr.width]="width()" [attr.height]="height" role="img"
                         [attr.aria-label]="'Витрати з початку місяця: ' + total()"
                         tabindex="0"
                         (pointerdown)="onMove($event)"
                         (pointermove)="onMove($event)"
                         (keydown)="onKey($event)">
                        <!-- gridlines + y ticks, one unit for the whole axis -->
                        <text class="unit" x="0" y="10">{{ unitCaption() }}</text>
                        @for (t of ticks(); track t) {
                            <line class="grid" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="y(t)" [attr.y2]="y(t)" />
                            <text class="tick" [attr.x]="m.left - 6" [attr.y]="y(t)" dy="0.32em" text-anchor="end">{{ tick(t) }}</text>
                        }
                        <!-- x ticks -->
                        @for (d of xTicks(); track d) {
                            <text class="tick" [attr.x]="x(d)" [attr.y]="height - 6" text-anchor="middle">{{ d }}</text>
                        }

                        @if (usual(); as u) {
                            <path class="usual" [attr.d]="path(u)" />
                        }
                        <path class="area" [attr.d]="area(a)" />
                        <path class="line" [attr.d]="path(a)" />

                        <!-- end dot + direct label -->
                        <circle class="dot" [attr.cx]="x(a.length)" [attr.cy]="y(a[a.length - 1])" r="4" />
                        <text class="end" [attr.x]="x(a.length) + 8" [attr.y]="y(a[a.length - 1])" dy="0.32em">{{ fmt(a[a.length - 1]) }}</text>
                        @if (usual(); as u) {
                            <text class="end end--muted" [attr.x]="width() - m.right + 8" [attr.y]="usualLabelY()" dy="0.32em">звично</text>
                        }

                        @if (hover(); as h) {
                            <line class="cross" [attr.x1]="x(h)" [attr.x2]="x(h)" [attr.y1]="m.top" [attr.y2]="height - m.bottom" />
                            @if (h <= a.length) {
                                <circle class="dot dot--hover" [attr.cx]="x(h)" [attr.cy]="y(a[h - 1])" r="4" />
                            }
                        }
                    </svg>

                    @if (hover(); as h) {
                        <div class="tip" [style.left.px]="tipLeft(h)">
                            <div class="tip__day num">День {{ h }}</div>
                            @if (h <= a.length) {
                                <div class="tip__row"><i class="key key--now"></i><b class="num">{{ money(a[h - 1]) }}</b><span>цей місяць</span></div>
                            }
                            @if (usual(); as u) {
                                <div class="tip__row"><i class="key key--usual"></i><b class="num">{{ money(u[h - 1]) }}</b><span>звично</span></div>
                            }
                        </div>
                    }
                } @else if (width() > 0) {
                    <p class="pace__empty">Цього місяця витрат ще немає.</p>
                }
            </div>
        </section>
    `,
    styles: [`
        :host { display: block; }

        .pace {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-md);
            padding: var(--space-3) var(--space-4) var(--space-2);
        }

        .pace__head {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: var(--space-2);
        }

        .pace__title { margin: 0; font-size: var(--fs-h3); font-weight: 600; }

        .pace__verdict {
            font-size: var(--fs-micro);
            font-weight: 600;
            color: var(--ink-2);
            &--up { color: var(--neg); }
            &--down { color: var(--pos); }
        }

        .pace__sub {
            margin: 2px 0 var(--space-2);
            font-size: var(--fs-micro);
            color: var(--ink-3);
        }

        .pace__plot { position: relative; }

        /* a finger can scrub along the days; vertical swipes still scroll the page */
        svg { display: block; overflow: visible; outline: none; touch-action: pan-y; }
        svg:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: var(--radius-xs); }

        .grid { stroke: var(--line); stroke-width: 1; }
        .tick { fill: var(--ink-3); font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
        .unit { fill: var(--ink-3); font-size: 10px; }

        .usual { fill: none; stroke: var(--series-other); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
        .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
        .area { fill: var(--accent); fill-opacity: 0.1; stroke: none; }

        .dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
        .cross { stroke: var(--line-2); stroke-width: 1; }

        /* a surface halo keeps the label readable where it crosses the other line */
        .end {
            fill: var(--ink);
            font-size: 11px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            paint-order: stroke;
            stroke: var(--surface);
            stroke-width: 3px;
            stroke-linejoin: round;
        }
        .end--muted { fill: var(--ink-3); font-weight: 500; }

        .tip {
            position: absolute;
            top: 0;
            transform: translateX(-50%);
            pointer-events: none;
            min-width: 132px;
            padding: var(--space-2) var(--space-3);
            background: var(--surface);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-pop);
            font-size: var(--fs-micro);
        }

        .tip__day { color: var(--ink-3); margin-bottom: 2px; }

        .tip__row {
            display: flex;
            align-items: center;
            gap: 6px;
            b { color: var(--ink); font-weight: 600; }
            span { color: var(--ink-3); }
        }

        .key { width: 10px; height: 2px; border-radius: 1px; flex: none; }
        .key--now { background: var(--accent); }
        .key--usual { background: var(--series-other); }

        .pace__empty {
            margin: 0;
            padding: var(--space-6) 0;
            text-align: center;
            font-size: var(--fs-meta);
            color: var(--ink-3);
        }
    `],
})
export class MonthPaceComponent implements AfterViewInit, OnDestroy {
    private readonly trends = inject(TrendsService);

    @Input() public set transactions(value: ITransaction[] | null) { this.rows.set(value ?? []); }
    @Input() public set year(value: number) { this.y_.set(value); }
    @Input() public set month(value: number) { this.m_.set(value); }
    @Input() public currency = 980;

    @ViewChild('plot') private readonly plotRef!: ElementRef<HTMLElement>;
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    public readonly height = HEIGHT;
    public readonly m = M;
    public readonly width = signal(0);
    public readonly hover = signal<number | null>(null);

    private readonly rows = signal<ITransaction[]>([]);
    private readonly y_ = signal(new Date().getFullYear());
    private readonly m_ = signal(new Date().getMonth() + 1);
    private stopObserving?: () => void;

    private readonly days = computed(() => new Date(this.y_(), this.m_(), 0).getDate());

    /** The last day with data on screen: today for the running month, else the whole month. */
    /** The month on screen is still going. */
    public readonly running = computed(() => {
        const now = new Date();
        return now.getFullYear() === this.y_() && now.getMonth() + 1 === this.m_();
    });

    public readonly lastDay = computed(() => (this.running() ? new Date().getDate() : this.days()));

    public readonly actual = computed(() => {
        const curve = this.trends.cumulativeByDay(this.y_(), this.m_(), this.rows());
        return curve ? curve.slice(0, this.lastDay()) : null;
    });

    public readonly usual = computed(() => this.trends.usualCumulative(this.y_(), this.m_()));

    private readonly maxValue = computed(() => {
        const a = this.actual() ?? [0];
        const u = this.usual() ?? [0];
        return Math.max(a[a.length - 1] ?? 0, u[u.length - 1] ?? 0, 1);
    });

    public readonly ticks = computed(() => niceTicks(this.maxValue(), 3));
    private readonly unit = computed(() => axisUnit(this.ticks()[this.ticks().length - 1]));
    public readonly unitCaption = computed(() => [this.unit().unit, currencySign(this.currency)].filter(Boolean).join(' '));

    public readonly xTicks = computed(() => {
        const d = this.days();
        return [1, 8, 15, 22, d];
    });

    public readonly total = computed(() => {
        const a = this.actual();
        return this.money(a ? a[a.length - 1] : 0);
    });

    /** "usual" sits at the end of its line, moved clear of this month's end label when the two meet. */
    public readonly usualLabelY = computed(() => {
        const u = this.usual();
        const a = this.actual();
        if (!u) return 0;
        const yUsual = this.y(u[u.length - 1]);
        if (!a || a.length < this.days()) return yUsual;   // this month's label is still mid-plot
        const yActual = this.y(a[a.length - 1]);
        if (Math.abs(yUsual - yActual) >= 14) return yUsual;
        return yUsual >= yActual ? yActual + 14 : yActual - 14;
    });

    public readonly usualAtToday = computed(() => {
        const u = this.usual();
        return u ? this.money(u[Math.min(this.lastDay(), u.length) - 1]) : '';
    });

    /** "12% above usual" — said in words, so colour is never the only signal. */
    public readonly verdict = computed(() => {
        const a = this.actual();
        const u = this.usual();
        if (!a || !u) return null;
        const now = a[a.length - 1];
        const usual = u[Math.min(this.lastDay(), u.length) - 1];
        if (!(usual > 0)) return null;
        const delta = now / usual - 1;
        const pct = Math.round(Math.abs(delta) * 100);
        const text = Math.abs(delta) <= 0.03
            ? 'у звичному темпі'
            : delta > 0 ? `↑ на ${pct}% більше звичного` : `↓ на ${pct}% менше звичного`;
        return { delta, text };
    });

    public ngAfterViewInit(): void {
        this.stopObserving = observeWidth(this.plotRef.nativeElement, w => this.width.set(w));
    }

    public ngOnDestroy(): void {
        this.stopObserving?.();
    }

    /** A tap anywhere else puts the crosshair away — a finger never "leaves" the chart. */
    @HostListener('document:pointerdown', ['$event'])
    public outside(event: PointerEvent): void {
        if (this.hover() !== null && !this.host.nativeElement.contains(event.target as Node)) this.hover.set(null);
    }

    public leave(event: PointerEvent): void {
        if (event.pointerType !== 'touch') this.hover.set(null);
    }

    public tick(value: number): string {
        return axisTick(value, this.unit().div);
    }

    // ── geometry ─────────────────────────────────────────────
    public x(day: number): number {
        const span = Math.max(1, this.days() - 1);
        return M.left + ((day - 1) / span) * (this.width() - M.left - M.right);
    }

    public y(value: number): number {
        const top = this.ticks()[this.ticks().length - 1] || 1;
        return HEIGHT - M.bottom - (value / top) * (HEIGHT - M.top - M.bottom);
    }

    public path(values: number[]): string {
        return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${this.x(i + 1).toFixed(1)},${this.y(v).toFixed(1)}`).join(' ');
    }

    public area(values: number[]): string {
        if (!values.length) return '';
        const base = this.y(0).toFixed(1);
        return `${this.path(values)} L${this.x(values.length).toFixed(1)},${base} L${this.x(1).toFixed(1)},${base} Z`;
    }

    public fmt(minor: number): string {
        return compactMoney(minor);
    }

    public money(minor: number): string {
        return fullMoney(minor, currencySign(this.currency));
    }

    public tipLeft(day: number): number {
        const x = this.x(day);
        return Math.min(Math.max(x, 72), this.width() - 72);
    }

    // ── hover / keyboard ─────────────────────────────────────
    public onMove(event: PointerEvent): void {
        const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
        const px = event.clientX - rect.left;
        const span = this.width() - M.left - M.right;
        const day = Math.round(((px - M.left) / span) * (this.days() - 1)) + 1;
        this.hover.set(Math.min(this.days(), Math.max(1, day)));
    }

    public onKey(event: KeyboardEvent): void {
        const current = this.hover() ?? this.lastDay();
        if (event.key === 'ArrowLeft') this.hover.set(Math.max(1, current - 1));
        else if (event.key === 'ArrowRight') this.hover.set(Math.min(this.days(), current + 1));
        else if (event.key === 'Escape') this.hover.set(null);
        else return;
        event.preventDefault();
    }
}
