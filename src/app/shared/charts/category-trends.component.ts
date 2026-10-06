import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TrendCategory, TrendMonth } from '@core/services/trends.service';
import { compactMoney, currencySign, fullMoney } from './chart-utils';

const SPARK_W = 132;
const SPARK_H = 30;

/**
 * Every spending category as a row: a 12-month sparkline (one hue, the running month
 * lighter), the year's total, the monthly average and how last month compares. It is
 * also the chart's table view — every number is readable without hovering.
 */
@Component({
    selector: 'app-category-trends',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="table" role="table" aria-label="Spending by category, last 12 months">
            <div class="row row--head" role="row">
                <span role="columnheader" class="micro">Category</span>
                <span role="columnheader" class="micro">12 months</span>
                <span role="columnheader" class="micro r">Total</span>
                <span role="columnheader" class="micro r">Per month</span>
                <span role="columnheader" class="micro r">{{ lastLabel }}</span>
            </div>

            @for (c of categories; track c.title) {
                <button type="button" class="row" role="row"
                        [class.row--on]="selected === c.title"
                        [attr.aria-pressed]="selected === c.title"
                        (click)="select.emit(selected === c.title ? null : c.title)">
                    <span class="name" role="cell">
                        <i class="swatch" [style.background]="colorFor(c.title)"></i>
                        @if (c.emoji) { <span class="emoji">{{ c.emoji }}</span> }
                        <span class="name__text">{{ c.title }}</span>
                    </span>

                    <span role="cell">
                        <svg class="spark" [attr.width]="sparkW" [attr.height]="sparkH" aria-hidden="true">
                            @for (v of c.perMonth; track $index; let i = $index) {
                                <rect [attr.x]="i * step(c)" [attr.y]="sparkH - barH(c, v)"
                                      [attr.width]="step(c) - 2" [attr.height]="barH(c, v)" rx="1.5"
                                      [attr.fill]="colorFor(c.title)"
                                      [attr.fill-opacity]="i === c.perMonth.length - 1 ? 0.4 : 1" />
                            }
                        </svg>
                    </span>

                    <span role="cell" class="r num strong">{{ fmt(c.total) }}</span>
                    <span role="cell" class="r num">{{ fmt(c.average) }}</span>
                    <span role="cell" class="r num delta" [class.delta--up]="change(c) > 0.1" [class.delta--down]="change(c) < -0.1"
                          [attr.title]="money(lastFull(c)) + ' vs ' + money(c.average) + ' a month'">
                        @if (c.average > 0) {
                            {{ change(c) >= 0 ? '↑' : '↓' }} {{ pct(change(c)) }}%
                        } @else { — }
                    </span>
                </button>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }

        .table { display: flex; flex-direction: column; }

        .row {
            display: grid;
            grid-template-columns: minmax(140px, 1.2fr) 148px 110px 100px 76px;
            align-items: center;
            gap: var(--space-3);
            width: 100%;
            min-height: 44px;
            padding: 0 var(--space-3);
            border: 0;
            border-bottom: 1px solid var(--line);
            background: none;
            font: inherit;
            text-align: left;
            color: var(--ink);
            cursor: pointer;
            transition: background var(--dur-fast) var(--ease);

            &:hover { background: var(--hover); }

            &--head {
                min-height: 32px;
                cursor: default;
                background: var(--raised);
                &:hover { background: var(--raised); }
            }

            &--on {
                background: var(--accent-tint);
                box-shadow: inset 2px 0 0 var(--accent);
                &:hover { background: var(--accent-tint); }
            }
        }

        .r { text-align: right; }

        .name {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            min-width: 0;
            font-size: var(--fs-meta);
            font-weight: 500;
        }

        .name__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }

        .spark { display: block; }

        .strong { font-weight: 600; font-size: var(--fs-meta); }
        .num { font-size: var(--fs-meta); color: var(--ink-2); }
        .strong.num { color: var(--ink); }

        .delta { font-size: var(--fs-micro); font-weight: 600; color: var(--ink-3); }
        .delta--up { color: var(--neg); }
        .delta--down { color: var(--pos); }

        @media (max-width: 760px) {
            .row { grid-template-columns: minmax(0, 1fr) 96px 64px; }
            .row > :nth-child(2), .row > :nth-child(4) { display: none; }
        }
    `],
})
export class CategoryTrendsComponent {
    @Input() public categories: TrendCategory[] = [];
    @Input() public months: TrendMonth[] = [];
    @Input() public selected: string | null = null;
    @Input() public currency = 980;
    @Input() public colorFor: (title: string) => string = () => 'var(--series-other)';

    @Output() public readonly select = new EventEmitter<string | null>();

    public readonly sparkW = SPARK_W;
    public readonly sparkH = SPARK_H;

    /** Label of the last FULL month, e.g. "Sep vs avg". */
    public get lastLabel(): string {
        const last = this.months[this.months.length - 2];
        return last ? `${last.label} vs avg` : 'Last month';
    }

    public step(c: TrendCategory): number {
        return SPARK_W / Math.max(1, c.perMonth.length);
    }

    public barH(c: TrendCategory, value: number): number {
        const max = Math.max(...c.perMonth, 1);
        return value > 0 ? Math.max(2, (value / max) * SPARK_H) : 0;
    }

    public lastFull(c: TrendCategory): number {
        return c.perMonth[c.perMonth.length - 2] ?? 0;
    }

    public change(c: TrendCategory): number {
        return c.average > 0 ? this.lastFull(c) / c.average - 1 : 0;
    }

    public pct(value: number): number {
        return Math.round(Math.abs(value) * 100);
    }

    public fmt(minor: number): string { return compactMoney(minor); }
    public money(minor: number): string { return fullMoney(minor, currencySign(this.currency)); }
}
