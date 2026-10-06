import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { buildAutoCategories } from '@core/helpers/auto-categories';
import { categoryIndexOf, UNCATEGORIZED } from '@core/helpers/categorize';
import { OTHER_TITLE, UNCATEGORIZED_TITLE } from '@core/helpers/category-titles';
import { flowOf } from '@core/helpers/flows';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { first } from 'rxjs';
import { CategoryColorsService } from './category-colors.service';
import { CategoryGroupService } from './category-group.service';

const MONTH_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const MONTH_NAME = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
/** How much history the charts can reach back: a year on screen, a year more for "usual". */
const HISTORY_MONTHS = 24;
const STALE_MS = 5 * 60 * 1000;

export interface TrendMonth {
    key: string;
    year: number;
    month: number;
    /** Short, for axes: «Жов». */
    label: string;
    /** Full, for tooltips: «Жовтень». */
    name: string;
    /** The current month — still running, so never compared like-for-like. */
    partial: boolean;
}

export interface TrendCategory {
    title: string;
    emoji: string;
    /** Real spending per month in minor units, aligned with `months`. */
    perMonth: number[];
    /** Over the full months only. */
    total: number;
    average: number;
}

interface History {
    cardId: string;
    cardCurrencyCode: number;
    rows: ITransaction[];
    fetchedAt: number;
}

/**
 * A card's last two years, classified once with exactly the rules the dashboard
 * uses — same categories (auto or mine), same honest counting (own-money moves out,
 * refunds netted). Feeds the trend charts, the month-pace chart and the app-wide
 * category colours.
 */
@Injectable({ providedIn: 'root' })
export class TrendsService {
    private readonly http = inject(HttpClient);
    private readonly basePathApi = inject(BASE_PATH_API);
    private readonly categories = inject(CategoryGroupService);
    private readonly colors = inject(CategoryColorsService);

    private readonly mode = toSignal(this.categories.mode$, { requireSync: true });
    private readonly countMode = toSignal(this.categories.countMode$, { requireSync: true });
    private readonly flowContext = toSignal(this.categories.flowContext$, { requireSync: true });
    private readonly mine = toSignal(this.categories.serverGroups$, { initialValue: [] as ICategoryGroup[] });

    private readonly history = signal<History | null>(null);
    public readonly loading = signal(false);
    public readonly error = signal<string | null>(null);

    public readonly currency = computed(() => this.history()?.cardCurrencyCode ?? 980);

    /** Category definitions only (no totals), so the classification is not redone on every refresh. */
    private readonly definitions = computed<ICategoryGroup[]>(() =>
        this.mode() === 'auto' ? buildAutoCategories(this.flowContext()) : this.mine(),
    );

    /**
     * Every row with its category and its counted value: spending as a positive
     * number, a refund as a negative one, anything not counted dropped.
     */
    private classify(rows: readonly ITransaction[]): Array<{ time: number; title: string | null; emoji: string; value: number }> {
        const groups = this.definitions();
        const ctx = this.flowContext();
        const real = this.countMode() === 'real';
        const out: Array<{ time: number; title: string | null; emoji: string; value: number }> = [];

        for (const tx of rows) {
            const amount = Number(tx.amount) || 0;
            const flow = flowOf(tx, ctx);
            if (real && flow === 'internal') continue;

            const index = categoryIndexOf(tx, groups);
            const group = index === UNCATEGORIZED ? null : groups[index];
            if (real && group?.excluded) continue;

            let value = 0;
            if (amount < 0) value = -amount;
            else if (real && flow === 'refund') value = -amount;
            else continue;   // income is not spending

            out.push({ time: tx.time, title: group?.title ?? null, emoji: group?.emoji ?? '', value });
        }
        return out;
    }

    private readonly classified = computed(() => this.classify(this.history()?.rows ?? []));

    /** The last 12 full months plus the current one, oldest first. */
    public readonly months = computed<TrendMonth[]>(() => {
        const now = new Date();
        return Array.from({ length: 13 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            return {
                key: `${year}-${month}`, year, month,
                label: MONTH_SHORT[month - 1], name: MONTH_NAME[month - 1],
                partial: i === 12,
            };
        });
    });

    /** Spending by category over the visible months, biggest first. */
    public readonly categoryTrends = computed<TrendCategory[]>(() => {
        const months = this.months();
        const slot = new Map(months.map((m, i) => [m.key, i]));
        const byTitle = new Map<string, TrendCategory>();
        const uncategorizedTitle = this.mode() === 'auto' ? OTHER_TITLE : UNCATEGORIZED_TITLE;

        for (const row of this.classified()) {
            const d = new Date(row.time * 1000);
            const i = slot.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
            if (i === undefined) continue;
            const title = row.title ?? uncategorizedTitle;
            let entry = byTitle.get(title);
            if (!entry) {
                entry = { title, emoji: row.emoji, perMonth: Array(months.length).fill(0), total: 0, average: 0 };
                byTitle.set(title, entry);
            }
            entry.perMonth[i] += row.value;
        }

        const fullMonths = months.length - 1;
        return Array.from(byTitle.values())
            .map(entry => {
                // a refund-heavy month can dip below zero; spending is never negative
                entry.perMonth = entry.perMonth.map(v => Math.max(0, v));
                entry.total = entry.perMonth.slice(0, fullMonths).reduce((a, b) => a + b, 0);
                entry.average = entry.total / fullMonths;
                return entry;
            })
            .filter(entry => entry.perMonth.some(v => v > 0))
            .sort((a, b) => b.total - a.total);
    });

    /** Total real spending per visible month. */
    public readonly monthTotals = computed(() => {
        const months = this.months();
        const totals = Array(months.length).fill(0);
        for (const category of this.categoryTrends()) category.perMonth.forEach((v, i) => (totals[i] += v));
        return totals;
    });

    /**
     * Cumulative real spending by day for one month. Pass `rows` for the month on
     * screen (live, straight from the ledger); without them the loaded history is used.
     */
    public cumulativeByDay(year: number, month: number, rows?: readonly ITransaction[]): number[] | null {
        const source = rows ? this.classify(rows) : this.classified();
        if (!rows && !this.history()) return null;
        const days = new Date(year, month, 0).getDate();
        const perDay = Array(days).fill(0);
        let any = false;
        for (const row of source) {
            const d = new Date(row.time * 1000);
            if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
            perDay[d.getDate() - 1] += row.value;
            any = true;
        }
        if (!any) return null;
        let running = 0;
        return perDay.map(v => (running += v));
    }

    /**
     * "Usual" pace: the average cumulative curve of the `count` full months before
     * (year, month), each stretched to the target month's length by holding its last
     * value. Null when the history does not reach back far enough.
     */
    public usualCumulative(year: number, month: number, count = 6): number[] | null {
        if (!this.history()) return null;
        const days = new Date(year, month, 0).getDate();
        const curves: number[][] = [];
        for (let back = 1; back <= count; back++) {
            const d = new Date(year, month - 1 - back, 1);
            if (!this.covers(d.getFullYear(), d.getMonth() + 1)) break;
            const curve = this.cumulativeByDay(d.getFullYear(), d.getMonth() + 1);
            if (curve) curves.push(curve);
        }
        if (curves.length < 3) return null;
        return Array.from({ length: days }, (_, day) =>
            curves.reduce((sum, curve) => sum + curve[Math.min(day, curve.length - 1)], 0) / curves.length,
        );
    }

    /** True when the history reaches back to (year, month). */
    public covers(year: number, month: number): boolean {
        const history = this.history();
        if (!history) return false;
        const now = new Date();
        const monthsBack = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
        return monthsBack <= HISTORY_MONTHS;
    }

    constructor() {
        // keep the app-wide category colours in step with the last year's ranking
        effect(() => {
            const ranked = this.categoryTrends()
                .filter(c => c.title !== OTHER_TITLE && c.title !== UNCATEGORIZED_TITLE)
                .map(c => c.title);
            if (ranked.length) this.colors.setRanking(this.mode(), ranked);
        }, { allowSignalWrites: true });
    }

    /** Load (or reuse) the history of a card. */
    public ensure(cardId: string | null | undefined): void {
        if (!cardId) return;
        const current = this.history();
        if (current && current.cardId === cardId && Date.now() - current.fetchedAt < STALE_MS) return;
        if (this.loading()) return;

        this.loading.set(true);
        this.error.set(null);
        const tz = -new Date().getTimezoneOffset();
        this.http
            .get<{ cardCurrencyCode: number; rows: ITransaction[] }>(
                `${this.basePathApi}/transaction/history/${cardId}?months=${HISTORY_MONTHS}&tz=${tz}`,
            )
            .pipe(first())
            .subscribe({
                next: ({ cardCurrencyCode, rows }) => {
                    this.history.set({ cardId, cardCurrencyCode, rows: rows ?? [], fetchedAt: Date.now() });
                    this.loading.set(false);
                },
                error: () => {
                    this.loading.set(false);
                    this.error.set('Не вдалося завантажити історію для графіків.');
                },
            });
    }
}
