import { ChangeDetectionStrategy, Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { categoryIndexOf, UNCATEGORIZED } from '@core/helpers/categorize';
import { BETWEEN_ACCOUNTS_TITLE, OTHER_TITLE, UNCATEGORIZED_TITLE } from '@core/helpers/category-titles';
import { CategoryColorsService } from '@core/services/category-colors.service';

import { CountMode, Flow, flowOf } from '@core/helpers/flows';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, CategoryMode } from '@core/services/category-group.service';
import { DisplayMoneyPipe } from '../../../../../../shared/pipes/display-money.pipe';
import { INTERNAL_FILTER, UNCATEGORIZED_FILTER } from '../transactions/transactions.component';

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

type Bucket = { spent: number; income: number; refunds: number; spentCount: number; incomeCount: number; net: number; count: number };
const empty = (): Bucket => ({ spent: 0, income: 0, refunds: 0, spentCount: 0, incomeCount: 0, net: 0, count: 0 });

/**
 * Where the money went this period, ranked. Each transaction counts once, so the
 * lines add up to the total. In the real view, money that only changed pockets is
 * pulled out into "Between your accounts", refunds reduce the category they came
 * from, and categories marked not-counted sit apart. Clicking a line filters the
 * ledger and the charts to it.
 */
@Component({
    selector: 'app-category-breakdown',
    standalone: true,
    imports: [DisplayMoneyPipe, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="bd">
            <header class="bd__head">
                <h2 class="bd__title">За категоріями</h2>
                <a class="bd__manage" routerLink="/categories">Керувати</a>
            </header>
            <div class="bd__switches">
                <div class="seg" role="tablist" aria-label="Витрати чи надходження">
                    <button type="button" role="tab" [attr.aria-selected]="side() === 'spent'"
                            [class.seg--on]="side() === 'spent'" (click)="side.set('spent')">Витрати</button>
                    <button type="button" role="tab" [attr.aria-selected]="side() === 'income'"
                            [class.seg--on]="side() === 'income'" (click)="side.set('income')">Надходження</button>
                </div>
                <div class="seg" role="group" aria-label="Які категорії">
                    <button type="button" [class.seg--on]="categoryMode === 'auto'" (click)="categoryModeChange.emit('auto')"
                            title="Лише вбудовані категорії за MCC і назвою торговця">Авто</button>
                    <button type="button" [class.seg--on]="categoryMode === 'plus'" (click)="categoryModeChange.emit('plus')"
                            title="Вбудовані категорії разом із вашими правилами">+ мої</button>
                </div>
            </div>

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
                                    {{ line.count }} оп. · {{ line.share }}%
                                    @if (line.uncategorized && categoryMode === 'plus') { <span class="line__cta">Призначити →</span> }
                                </span>
                            </button>
                        </li>
                    }
                </ul>
            } @else {
                <p class="bd__empty">{{ side() === 'spent' ? 'Витрат' : 'Надходжень' }} за цей період немає.</p>
            }

            @if (notCounted().length) {
                <div class="bd__excluded">
                    <span class="micro">Не враховано</span>
                    @for (line of notCounted(); track line.filter) {
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
            padding: var(--space-3) var(--space-4) var(--space-2);
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

        .bd__switches {
            display: flex;
            justify-content: space-between;
            gap: var(--space-2);
            padding: 0 var(--space-4) var(--space-3);
            border-bottom: 1px solid var(--line);
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
    private readonly flowContext = toSignal(inject(CategoryGroupService).flowContext$, { requireSync: true });
    private readonly colors = inject(CategoryColorsService);

    @Input() public set transactions(value: ITransaction[] | null) { this.txList.set(value ?? []); }
    @Input() public set groups(value: ICategoryGroup[] | null) { this.groupList.set(value ?? []); }
    @Input() public set countMode(value: CountMode) { this.mode.set(value); }
    @Input() public categoryMode: CategoryMode = 'auto';
    @Input() public active: string | null = null;
    @Input() public currency = 980;

    @Output() public readonly select = new EventEmitter<string | null>();
    @Output() public readonly categoryModeChange = new EventEmitter<CategoryMode>();

    private readonly txList = signal<ITransaction[]>([]);
    private readonly groupList = signal<ICategoryGroup[]>([]);
    private readonly mode = signal<CountMode>('real');
    public readonly side = signal<'spent' | 'income'>('spent');

    /** One pass: every transaction lands in exactly one bucket. */
    private readonly buckets = computed(() => {
        const groups = this.groupList();
        const real = this.mode() === 'real';
        const ctx = this.flowContext();

        const byIndex = groups.map(empty);
        const uncategorized = empty();
        const internal = empty();
        const excluded = groups.map(empty);

        for (const tx of this.txList()) {
            const amount = Number(tx.amount) || 0;
            const flow: Flow | null = real ? flowOf(tx, ctx) : null;

            if (flow === 'internal') {
                add(internal, amount, false);
                continue;
            }
            const index = categoryIndexOf(tx, groups);
            if (real && index !== UNCATEGORIZED && groups[index]?.excluded) {
                add(excluded[index], amount, false);
                continue;
            }
            add(index === UNCATEGORIZED ? uncategorized : byIndex[index], amount, flow === 'refund');
        }
        return { byIndex, uncategorized, internal, excluded };
    });

    public readonly lines = computed<Line[]>(() => {
        const side = this.side();
        const groups = this.groupList();
        const real = this.mode() === 'real';
        const { byIndex, uncategorized } = this.buckets();

        const magnitude = (b: Bucket) => (side === 'spent' ? Math.max(0, b.spent - b.refunds) : b.income);
        const count = (b: Bucket) => (side === 'spent' ? b.spentCount : b.incomeCount);

        const raw = groups
            .map((group, index) => ({ group, index, bucket: byIndex[index] }))
            .filter(({ group, bucket }) => !(real && group.excluded) && magnitude(bucket) > 0)
            .map(({ group, index, bucket }) => ({
                filter: group.title,
                title: group.title,
                emoji: group.emoji ?? '',
                color: this.colors.colorFor(group.title),
                magnitude: magnitude(bucket),
                count: count(bucket),
                uncategorized: false,
            }));

        if (magnitude(uncategorized) > 0) {
            raw.push({
                filter: UNCATEGORIZED_FILTER,
                title: OTHER_TITLE,
                emoji: '',
                color: this.colors.colorFor(null),
                magnitude: magnitude(uncategorized),
                count: count(uncategorized),
                uncategorized: true,
            });
        }

        const total = raw.reduce((sum, line) => sum + line.magnitude, 0) || 1;
        const max = Math.max(1, ...raw.map(line => line.magnitude));

        return raw
            .sort((a, b) => (a.uncategorized !== b.uncategorized ? (a.uncategorized ? 1 : -1) : b.magnitude - a.magnitude))
            .map(({ magnitude: m, ...line }) => ({
                ...line,
                value: side === 'spent' ? -m : m,
                width: Math.max(2, Math.round((m / max) * 100)),
                share: Math.round((m / total) * 100),
            }));
    });

    /** Shown for completeness, left out of every figure above. */
    public readonly notCounted = computed(() => {
        if (this.mode() !== 'real') return [];
        const { internal, excluded } = this.buckets();
        const groups = this.groupList();
        const out: Array<{ filter: string; title: string; color: string; value: number }> = [];
        if (internal.count) {
            out.push({ filter: INTERNAL_FILTER, title: BETWEEN_ACCOUNTS_TITLE, color: 'var(--line-2)', value: internal.net });
        }
        groups.forEach((group, index) => {
            if (group.excluded && excluded[index].count) {
                out.push({ filter: group.title, title: group.title, color: this.colors.colorFor(group.title), value: excluded[index].net });
            }
        });
        return out;
    });

    public toggle(filter: string): void {
        this.select.emit(this.active === filter ? null : filter);
    }
}

function add(bucket: Bucket, amount: number, refund: boolean): void {
    bucket.count += 1;
    bucket.net += amount;
    if (refund) bucket.refunds += amount;
    else if (amount < 0) { bucket.spent += -amount; bucket.spentCount += 1; }
    else if (amount > 0) { bucket.income += amount; bucket.incomeCount += 1; }
}
