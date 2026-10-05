import { ChangeDetectionStrategy, Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { categoryColor, summarize, UNCATEGORIZED } from '@core/helpers/categorize';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { DisplayMoneyPipe } from '../../../../../../shared/pipes/display-money.pipe';
import { UNCATEGORIZED_FILTER } from '../transactions/transactions.component';

type Line = {
    filter: string;
    title: string;
    emoji: string;
    color: string;
    value: number;
    count: number;
    width: number;
    share: number;
    uncategorized: boolean;
};

/**
 * Where the money went this period, ranked. Each transaction is counted once (see
 * categorize.ts), so the lines add up to the total. Clicking a line filters the
 * ledger to it; clicking it again clears the filter.
 */
@Component({
    selector: 'app-category-breakdown',
    standalone: true,
    imports: [DisplayMoneyPipe, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="bd">
            <header class="bd__head">
                <h2 class="bd__title">By category</h2>
                <div class="seg" role="tablist" aria-label="Spending or income">
                    <button type="button" role="tab" [attr.aria-selected]="side() === 'spent'"
                            [class.seg--on]="side() === 'spent'" (click)="side.set('spent')">Spending</button>
                    <button type="button" role="tab" [attr.aria-selected]="side() === 'income'"
                            [class.seg--on]="side() === 'income'" (click)="side.set('income')">Income</button>
                </div>
                <a class="bd__manage" routerLink="/categories">Manage</a>
            </header>

            @if (lines().length) {
                <ul class="bd__list">
                    @for (line of lines(); track line.filter) {
                        <li>
                            <button type="button"
                                    class="line"
                                    [class.line--on]="active === line.filter"
                                    [class.line--todo]="line.uncategorized"
                                    [attr.aria-pressed]="active === line.filter"
                                    (click)="toggle(line.filter)">
                                <span class="line__top">
                                    <span class="line__name">
                                        <span class="dot" [style.background]="line.color"></span>
                                        @if (line.emoji) { <span class="emoji">{{ line.emoji }}</span> }
                                        {{ line.title }}
                                    </span>
                                    <span class="line__val num">{{ line.value | displayMoney: currency }}</span>
                                </span>
                                <span class="line__bar"><span [style.width.%]="line.width" [style.background]="line.color"></span></span>
                                <span class="line__meta num">
                                    {{ line.count }} tx · {{ line.share }}%
                                    @if (line.uncategorized) { <span class="line__cta">Categorize →</span> }
                                </span>
                            </button>
                        </li>
                    }
                </ul>
            } @else {
                <p class="bd__empty">{{ side() === 'spent' ? 'No spending' : 'No income' }} this period.</p>
            }

            @if (excluded().length) {
                <div class="bd__excluded">
                    <span class="micro">Not counted</span>
                    @for (line of excluded(); track line.filter) {
                        <button type="button" class="ex" [class.ex--on]="active === line.filter" (click)="toggle(line.filter)">
                            <span class="dot" [style.background]="line.color"></span>
                            <span class="ex__name">{{ line.title }}</span>
                            <span class="ex__val num">{{ line.value | displayMoney: currency }}</span>
                        </button>
                    }
                </div>
            }
        </section>
    `,
    styles: [`
        :host { display: block; }

        .bd {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-md);
            overflow: hidden;
        }

        .bd__head {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-3) var(--space-4);
            border-bottom: 1px solid var(--line);
        }

        .bd__title {
            margin: 0;
            flex: 1;
            font-size: var(--fs-h3);
            font-weight: 600;
        }

        .bd__manage {
            font-size: var(--fs-meta);
            font-weight: 500;
            color: var(--accent);
            text-decoration: none;
            &:hover { color: var(--accent-2); }
        }

        .seg {
            display: flex;
            border: 1px solid var(--line-2);
            border-radius: var(--radius-sm);
            overflow: hidden;

            button {
                height: 26px;
                padding: 0 var(--space-2);
                border: 0;
                background: none;
                font: inherit;
                font-size: var(--fs-micro);
                font-weight: 500;
                color: var(--ink-3);
                cursor: pointer;
                & + button { border-left: 1px solid var(--line); }
                &:hover { color: var(--ink); }
            }
            .seg--on { background: var(--accent-tint); color: var(--ink); font-weight: 600; }
        }

        .bd__list {
            list-style: none;
            margin: 0;
            padding: var(--space-1) var(--space-2);
        }

        .line {
            display: flex;
            flex-direction: column;
            gap: 5px;
            width: 100%;
            padding: var(--space-2);
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            font: inherit;
            text-align: left;
            cursor: pointer;
            transition: background var(--dur-fast) var(--ease);

            &:hover { background: var(--hover); }

            &--on {
                background: var(--accent-tint);
                box-shadow: inset 2px 0 0 var(--accent);
            }
        }

        .line__top {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: var(--space-3);
        }

        .line__name {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            min-width: 0;
            font-size: var(--fs-meta);
            font-weight: 500;
            color: var(--ink);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .line__val {
            flex: none;
            font-size: var(--fs-meta);
            font-weight: 600;
            color: var(--ink);
        }

        .line__bar {
            height: 3px;
            border-radius: 2px;
            background: var(--sunken);
            overflow: hidden;
            span { display: block; height: 100%; border-radius: 2px; transition: width var(--dur-slow) var(--ease); }
        }

        .line__meta {
            display: flex;
            justify-content: space-between;
            font-size: var(--fs-micro);
            color: var(--ink-3);
        }

        .line__cta { color: var(--accent); font-weight: 600; }

        .line--todo .line__name { color: var(--ink-2); }

        .dot { width: 9px; height: 9px; border-radius: 2px; flex: none; }

        .bd__empty {
            margin: 0;
            padding: var(--space-5) var(--space-4);
            font-size: var(--fs-meta);
            color: var(--ink-3);
            text-align: center;
        }

        .bd__excluded {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: var(--space-3) var(--space-2) var(--space-2);
            border-top: 1px solid var(--line);
            background: var(--raised);

            .micro { padding: 0 var(--space-2) var(--space-1); }
        }

        .ex {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            height: 30px;
            padding: 0 var(--space-2);
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            font: inherit;
            font-size: var(--fs-micro);
            color: var(--ink-2);
            cursor: pointer;
            text-align: left;

            &:hover { background: var(--hover); }
            &--on { background: var(--accent-tint); color: var(--ink); }
        }

        .ex__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ex__val { font-weight: 600; }
    `],
})
export class CategoryBreakdownComponent {
    @Input() public set transactions(value: ITransaction[] | null) { this.txList.set(value ?? []); }
    @Input() public set groups(value: ICategoryGroup[] | null) { this.groupList.set(value ?? []); }
    @Input() public active: string | null = null;
    @Input() public currency = 980;

    @Output() public readonly select = new EventEmitter<string | null>();

    private readonly txList = signal<ITransaction[]>([]);
    private readonly groupList = signal<ICategoryGroup[]>([]);
    public readonly side = signal<'spent' | 'income'>('spent');

    private readonly summary = computed(() => summarize(this.txList(), this.groupList()));

    public readonly lines = computed<Line[]>(() => {
        const side = this.side();
        const groups = this.groupList();
        const { byIndex, uncategorized } = this.summary();

        const raw = groups
            .map((group, index) => ({ group, index, totals: byIndex[index] }))
            .filter(({ group, totals }) => !group.excluded && totals && totals[side] > 0)
            .map(({ group, index, totals }) => ({
                filter: group.title,
                title: group.title,
                emoji: group.emoji ?? '',
                color: categoryColor(index),
                value: side === 'spent' ? -totals.spent : totals.income,
                count: side === 'spent' ? totals.spentCount : totals.incomeCount,
                magnitude: totals[side],
                uncategorized: false,
            }));

        if (uncategorized[side] > 0) {
            raw.push({
                filter: UNCATEGORIZED_FILTER,
                title: 'Uncategorized',
                emoji: '',
                color: categoryColor(UNCATEGORIZED),
                value: side === 'spent' ? -uncategorized.spent : uncategorized.income,
                count: side === 'spent' ? uncategorized.spentCount : uncategorized.incomeCount,
                magnitude: uncategorized[side],
                uncategorized: true,
            });
        }

        const total = raw.reduce((sum, line) => sum + line.magnitude, 0) || 1;
        const max = Math.max(1, ...raw.map(line => line.magnitude));

        return raw
            .sort((a, b) => {
                if (a.uncategorized !== b.uncategorized) return a.uncategorized ? 1 : -1;
                return b.magnitude - a.magnitude;
            })
            .map(({ magnitude, ...line }) => ({
                ...line,
                width: Math.max(2, Math.round((magnitude / max) * 100)),
                share: Math.round((magnitude / total) * 100),
            }));
    });

    /** Transfer-type categories: shown for completeness, left out of the totals. */
    public readonly excluded = computed(() => {
        const { byIndex } = this.summary();
        return this.groupList()
            .map((group, index) => ({ group, index, totals: byIndex[index] }))
            .filter(({ group, totals }) => group.excluded && totals?.count)
            .map(({ group, index, totals }) => ({
                filter: group.title,
                title: group.title,
                color: categoryColor(index),
                value: totals.net,
            }));
    });

    public toggle(filter: string): void {
        this.select.emit(this.active === filter ? null : filter);
    }
}

