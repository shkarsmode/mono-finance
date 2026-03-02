import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartType, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { first, lastValueFrom, Observable, Subject } from 'rxjs';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from '../../../../shared/pipes/transactions-sort-by.pipe';
import {
    CardComponent, CategoryManagerComponent, ChartComponent,
    FloatingToolbarComponent, TransactionsComponent
} from './components';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        AsyncPipe, DatePipe, DecimalPipe,
        CardComponent, ChartComponent, TransactionsComponent,
        CategoryManagerComponent, FloatingToolbarComponent,
        TransactionsFilterPipe, TransactionsSortByPipe,
    ],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DashboardComponent implements OnInit {
    private readonly monobankService = inject(MonobankService);
    private readonly categoryGroupService = inject(CategoryGroupService);
    private readonly destroyRef = inject(DestroyRef);

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly sortDirection = signal<'asc' | 'desc'>('desc');
    readonly sortBy = signal<TransactionSortBy>(TransactionSortBy.Date);
    readonly isBulkLoading = signal(false);
    readonly processedMonths = signal(0);
    readonly emptyStreak = signal(0);
    readonly rateLimitLeftSec = signal(0);
    readonly maxEmptyStreak = 2;

    activeCardId$!: Observable<string>;
    clientInfo$!: Observable<IAccountInfo>;
    groups$!: Observable<ICategoryGroup[]>;
    transactions$!: Observable<ITransaction[]>;
    readonly ChartType = ChartType;

    // ── Spending Insights (bonus feature) ──
    readonly totalExpenses = computed(() => {
        const txs = this.transactions();
        return txs.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
    });

    readonly totalIncome = computed(() => {
        const txs = this.transactions();
        return txs.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    });

    readonly biggestExpense = computed(() => {
        const txs = this.transactions().filter(t => t.amount < 0);
        if (!txs.length) return null;
        return txs.reduce((max, t) => t.amount < max.amount ? t : max, txs[0]);
    });

    readonly averageDailySpend = computed(() => {
        const txs = this.transactions().filter(t => t.amount < 0);
        if (!txs.length) return 0;
        const days = new Set(txs.map(t => new Date(t.time * 1000).toDateString())).size;
        const total = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        return days > 0 ? total / days : 0;
    });

    readonly transactionCount = computed(() => this.transactions().length);

    /** Sorted accounts: type='white' always first */
    readonly sortedAccounts = computed(() => {
        const info = this.clientInfoSignal();
        if (!info?.accounts) return [];
        return [...info.accounts].sort((a, b) => {
            if (a.type === 'white' && b.type !== 'white') return -1;
            if (a.type !== 'white' && b.type === 'white') return 1;
            return 0;
        });
    });

    /** Transaction descriptions for category autocomplete */
    readonly transactionDescriptions = computed(() => {
        const txs = this.transactions();
        return Array.from(new Set(txs.map(t => t.description)));
    });

    /** Category editing state */
    readonly editingCategory = signal<ICategoryGroup | null>(null);
    readonly showCategoryEditor = signal(false);
    readonly showFloatingToolbar = signal(true);
    readonly clientInfoSignal = signal<IAccountInfo | null>(null);

    // ── Date picker state (owned by dashboard, always available) ──
    activeMonth = new Date().getMonth() + 1;
    activeYear = new Date().getFullYear();
    readonly currentMonth = new Date().getMonth() + 1;
    readonly currentYear = new Date().getFullYear();
    readonly monthsMap = [
        { name: 'Jan', value: 1 }, { name: 'Feb', value: 2 },
        { name: 'Mar', value: 3 }, { name: 'Apr', value: 4 },
        { name: 'May', value: 5 }, { name: 'Jun', value: 6 },
        { name: 'Jul', value: 7 }, { name: 'Aug', value: 8 },
        { name: 'Sep', value: 9 }, { name: 'Oct', value: 10 },
        { name: 'Nov', value: 11 }, { name: 'Dec', value: 12 },
    ];
    yearsMap: number[] = [];

    private cancelBulkRequested = false;
    private readonly cancelPreviousRequest$ = new Subject<void>();

    @ViewChild('transactionsRef') transactionsRef!: TransactionsComponent;

    ngOnInit(): void {
        const numberOfYears = new Date().getFullYear() - 2017;
        for (let i = 0; i <= numberOfYears; i++) {
            this.yearsMap.push(2017 + (numberOfYears - i));
        }

        this.activeCardId$ = this.monobankService.activeCardId$;
        this.clientInfo$ = this.monobankService.clientInfo$;
        this.groups$ = this.categoryGroupService.categoryGroups$;
        this.transactions$ = this.monobankService.currentTransactions$;

        this.transactions$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(t => this.transactions.set(t));

        this.clientInfo$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(info => this.clientInfoSignal.set(info));

        this.monobankService.rateLimitCooldown$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(sec => this.rateLimitLeftSec.set(sec));
    }

    onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    onSelectMonth(month: number): void {
        this.activeMonth = month;
        this.monobankService.activeMonth = month;
        if (this.transactionsRef) this.transactionsRef.activeMonth = month;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(month, this.activeYear)
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    onSelectYear(year: number): void {
        this.activeYear = year;
        this.monobankService.activeYear = year;
        if (this.transactionsRef) this.transactionsRef.activeYear = year;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(this.activeMonth, year)
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    onSearchTransaction(value: string): void {
        this.searchValue.set(value);
    }

    onSelectValueChange(value: string[]): void {
        this.searchValue.set(value.join());
    }

    onSortTransactionsBy(sort: { sortBy: TransactionSortBy; direction: 'asc' | 'desc' }): void {
        this.sortBy.set(sort.sortBy);
        this.sortDirection.set(sort.direction);
    }

    get bulkProgressPercent(): number {
        return Math.max(0, Math.min(100, Math.round(this.processedMonths() / 24 * 100)));
    }

    async onLoadAllClick(): Promise<void> {
        if (this.isBulkLoading() || this.rateLimitLeftSec() > 0) return;

        this.isBulkLoading.set(true);
        this.cancelBulkRequested = false;
        this.processedMonths.set(0);
        this.emptyStreak.set(0);

        try {
            let y = this.monobankService.activeYear;
            let m = this.monobankService.activeMonth;

            while (
                !this.cancelBulkRequested &&
                this.emptyStreak() < this.maxEmptyStreak &&
                this.processedMonths() < 240 &&
                y >= 2015
            ) {
                const trs = await lastValueFrom(
                    this.monobankService.getTransactions(m, y).pipe(first())
                );

                if ((trs as any)['status'] === 429) {
                    await new Promise(r => setTimeout(r, 60001));
                    continue;
                }

                if ((trs as any)['data']?.length) {
                    this.emptyStreak.set(0);
                    this.monobankService.mergeTransactions(trs as any);
                } else {
                    this.emptyStreak.update(v => v + 1);
                }

                this.processedMonths.update(v => v + 1);
                if (m > 1) { m--; } else { m = 12; y--; }

                if (this.transactionsRef) {
                    this.transactionsRef.activeMonth = m;
                    this.transactionsRef.activeYear = y;
                }
                this.monobankService.activeMonth = m;
                this.monobankService.activeYear = y;
            }
        } catch (err) {
            console.error('Bulk load failed:', err);
        } finally {
            this.isBulkLoading.set(false);
        }
    }

    onCancelLoadAll(): void {
        this.cancelBulkRequested = true;
    }

    // ── Category Management ──
    onAddCategory(): void {
        this.editingCategory.set(null);
        this.showCategoryEditor.set(true);
    }

    onEditCategory(group: ICategoryGroup): void {
        this.editingCategory.set(group);
        this.showCategoryEditor.set(true);
    }

    onSaveCategory(group: ICategoryGroup): void {
        this.categoryGroupService.set(group);
        this.showCategoryEditor.set(false);
        this.editingCategory.set(null);
    }

    onDeleteCategory(group: ICategoryGroup): void {
        this.categoryGroupService.delete(group);
        this.showCategoryEditor.set(false);
        this.editingCategory.set(null);
    }

    onCloseCategoryEditor(): void {
        this.showCategoryEditor.set(false);
        this.editingCategory.set(null);
    }
}