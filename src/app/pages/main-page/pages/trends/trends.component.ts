import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { cardName } from '@core/helpers/card-names';
import { IAccountInfo } from '@core/interfaces';
import { CategoryColorsService } from '@core/services/category-colors.service';
import { CategoryGroupService } from '@core/services/category-group.service';
import { MonobankService } from '@core/services/monobank.service';
import { TrendsService } from '@core/services/trends.service';
import { compactMoney, currencySign, fullMoney } from '../../../../shared/charts/chart-utils';
import { CategoryTrendsComponent } from '../../../../shared/charts/category-trends.component';
import { TrendColumnsComponent } from '../../../../shared/charts/trend-columns.component';

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

@Component({
    selector: 'app-trends',
    standalone: true,
    imports: [TrendColumnsComponent, CategoryTrendsComponent],
    templateUrl: './trends.component.html',
    styleUrl: './trends.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TrendsComponent {
    private readonly monobank = inject(MonobankService);
    private readonly categories = inject(CategoryGroupService);
    private readonly router = inject(Router);
    public readonly trends = inject(TrendsService);
    public readonly colors = inject(CategoryColorsService);

    public readonly mode = toSignal(this.categories.mode$, { requireSync: true });
    public readonly countMode = toSignal(this.categories.countMode$, { requireSync: true });
    private readonly info = toSignal(this.monobank.clientInfo$ as Observable<IAccountInfo | null>, { initialValue: null });
    private readonly cardId = toSignal(this.monobank.activeCardId$, { initialValue: '' });

    public readonly selected = signal<string | null>(null);
    public readonly colorFor = (title: string) => this.colors.colorFor(title);

    public readonly card = computed(() => {
        const account = this.info()?.accounts?.find(a => a.id === this.cardId());
        if (!account) return '';
        return `${cardName(account.type)} · ${currencySign(account.currencyCode)}`;
    });

    public readonly months = this.trends.months;
    public readonly categoryTrends = this.trends.categoryTrends;
    public readonly currency = this.trends.currency;

    private readonly fullTotals = computed(() => this.trends.monthTotals().slice(0, -1));

    public readonly yearTotal = computed(() => this.fullTotals().reduce((a, b) => a + b, 0));
    public readonly perMonth = computed(() => this.yearTotal() / Math.max(1, this.fullTotals().length));

    public readonly highest = computed(() => {
        const totals = this.fullTotals();
        if (!totals.length) return null;
        const i = totals.indexOf(Math.max(...totals));
        const month = this.months()[i];
        return { value: totals[i], label: `${MONTHS[month.month - 1]} ${month.year}` };
    });

    public readonly soFar = computed(() => {
        const totals = this.trends.monthTotals();
        const now = totals[totals.length - 1] ?? 0;
        const today = new Date();
        const day = today.getDate();
        // the dashboard's pace chart "usual": where the months before stood by this day
        const usual = this.trends.usualCumulative(today.getFullYear(), today.getMonth() + 1);
        const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const expected = usual ? usual[Math.min(day, usual.length) - 1] : this.perMonth() * (day / days);
        const delta = expected > 0 ? now / expected - 1 : 0;
        return { value: now, delta, steady: Math.abs(delta) <= 0.03 };
    });

    constructor() {
        this.monobank.activeCardId$
            .pipe(takeUntilDestroyed(inject(DestroyRef)))
            .subscribe(id => this.trends.ensure(id));
    }

    public setMode(mode: 'auto' | 'plus'): void {
        this.selected.set(null);
        this.categories.setMode(mode);
    }

    public setCountMode(mode: 'real' | 'all'): void {
        this.categories.setCountMode(mode);
    }

    /** Clicking a month opens it on the dashboard. */
    public openMonth(period: { year: number; month: number }): void {
        this.monobank.setPeriod(period.month, period.year);
        const now = new Date();
        const current = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
        this.router.navigate(['/dashboard'], {
            queryParams: current ? {} : { month: `${period.year}-${String(period.month).padStart(2, '0')}` },
        });
    }

    public fmt(minor: number): string { return compactMoney(minor); }
    public money(minor: number): string { return fullMoney(minor, currencySign(this.currency())); }
    public pct(value: number): number { return Math.round(Math.abs(value) * 100); }
}
