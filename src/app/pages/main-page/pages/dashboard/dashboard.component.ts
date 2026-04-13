import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartType, LocalStorage, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { first, firstValueFrom, lastValueFrom, Observable, Subject } from 'rxjs';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from '../../../../shared/pipes/transactions-sort-by.pipe';
import {
    CardComponent, CategoryManagerComponent, ChartComponent, TransactionsComponent
} from './components';
import { FloatingToolbarComponent } from './components/floating-toolbar/floating-toolbar.component';

@Component({
selector: 'app-dashboard',
    standalone: true,
    imports: [
        AsyncPipe, DatePipe, DecimalPipe,
        CardComponent, ChartComponent, TransactionsComponent,
        CategoryManagerComponent, FloatingToolbarComponent,
        TransactionsFilterPipe, TransactionsSortByPipe,
        DragDropModule,
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
        return txs.filter(t => +t.amount < 0).reduce((sum, t) => sum + +(t.amount ?? 0), 0);
    });

    readonly totalIncome = computed(() => {
        const txs = this.transactions();
        return txs.filter(t => +t.amount > 0).reduce((sum, t) => sum + +(t.amount ?? 0), 0);
    });

    readonly biggestExpense = computed(() => {
        const txs = this.transactions().filter(t => +t.amount < 0);
        if (!txs.length) return null;
        return txs.reduce((max, t) => +t.amount < +max.amount ? t : max, txs[0]);
    });

    readonly averageDailySpend = computed(() => {
        const txs = this.transactions().filter(t => +t.amount < 0);
        if (!txs.length) return 0;
        const days = new Set(txs.map(t => new Date(t.time * 1000).toDateString())).size;
        const total = txs.reduce((sum, t) => sum + Math.abs((t.amount) ?? 0), 0);
        return days > 0 ? total / days : 0;
    });

    readonly transactionCount = computed(() => this.transactions().length);

    /** Sorted accounts: type='white' always first, filtered by chip selection */
    readonly sortedAccounts = computed(() => {
        const info = this.clientInfoSignal();
        if (!info?.accounts) return [];
        const filters = this.cardTypeFilters();
        const filtered = filters.size > 0
            ? info.accounts.filter(a => filters.has(a.type))
            : info.accounts;
        return [...filtered].sort((a, b) => {
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
    readonly showCategoryDrawer = signal(false);
    readonly showFloatingToolbar = signal(true);
    readonly clientInfoSignal = signal<IAccountInfo | null>(null);

    // ── Card type filter chips ──
    readonly cardTypeFilters = signal<Set<string>>(this.loadCardTypeFilters());
    readonly availableCardTypes = computed(() => {
        const info = this.clientInfoSignal();
        if (!info?.accounts) return [];
        const types = new Set(info.accounts.map(a => a.type).filter(Boolean));
        return Array.from(types);
    });

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
                try {
                    const result = await lastValueFrom(
                        this.monobankService.getTransactionsWithRetry(m, y).pipe(first())
                    );

                    const data = (result as any)?.data ?? result;
                    if (Array.isArray(data) && data.length > 0) {
                        this.emptyStreak.set(0);
                        this.monobankService.mergeTransactions(data);
                    } else {
                        this.emptyStreak.update(v => v + 1);
                    }

                    // Respect nextAllowedAt from meta if present
                    const meta = (result as any)?.meta;
                    if (meta?.nextAllowedAt) {
                        const waitSec = Math.max(0, Number(meta.nextAllowedAt) - Math.floor(Date.now() / 1000));
                        if (waitSec > 1) {
                            this.rateLimitLeftSec.set(waitSec);
                            await new Promise(r => setTimeout(r, waitSec * 1000));
                        }
                    }
                } catch (err: any) {
                    // On rate limit error, wait and retry this same month
                    if (err?.status === 429 || (err?.error?.message ?? '').toString().toLowerCase().includes('too many')) {
                        const waitSec = this.monobankService.parseRetryAfterFromError(err);
                        this.rateLimitLeftSec.set(waitSec);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                        continue; // retry same month
                    }
                    // For non-429 errors, skip this month
                    console.warn(`Bulk load error for ${y}/${m}:`, err);
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

    // ── Card Type Filter ──
    toggleCardTypeFilter(type: string): void {
        const current = new Set(this.cardTypeFilters());
        if (current.has(type)) {
            current.delete(type);
        } else {
            current.add(type);
        }
        this.cardTypeFilters.set(current);
        this.saveCardTypeFilters(current);
    }

    clearCardTypeFilters(): void {
        this.cardTypeFilters.set(new Set());
        localStorage.removeItem(LocalStorage.CardTypeFilters);
    }

    private loadCardTypeFilters(): Set<string> {
        try {
            const raw = localStorage.getItem(LocalStorage.CardTypeFilters);
            if (raw) return new Set(JSON.parse(raw));
        } catch { /* ignore */ }
        return new Set();
    }

    private saveCardTypeFilters(filters: Set<string>): void {
        localStorage.setItem(LocalStorage.CardTypeFilters, JSON.stringify([...filters]));
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

    // Handle drag & drop reordering of category groups
    async onCategoryDrop(event: CdkDragDrop<ICategoryGroup[]>): Promise<void> {
        const groups = (await firstValueFrom(this.groups$)) as ICategoryGroup[];
        if (!groups) return;

        const updated = [...groups];
        moveItemInArray(updated, event.previousIndex, event.currentIndex);

        // Apply ordering change and persist via service
        this.categoryGroupService.changeOrdering(updated);
    }
}
