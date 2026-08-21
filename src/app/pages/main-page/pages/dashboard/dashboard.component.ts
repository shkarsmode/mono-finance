import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ChartType, LocalStorage, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, CurrencyDisplayService, MonobankService } from '@core/services';
import { SyncStatusService } from '@core/services/sync-status.service';
import { ToastService } from '@shared/components';
import { first, firstValueFrom, Observable, Subject } from 'rxjs';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
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
        DisplayMoneyPipe, DisplayMoneyMajorPipe,
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
    private readonly router = inject(Router);
    readonly currencyDisplay = inject(CurrencyDisplayService);
    readonly syncStatus = inject(SyncStatusService);
    private readonly toast = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly sortDirection = signal<'asc' | 'desc'>('desc');
    readonly sortBy = signal<TransactionSortBy>(TransactionSortBy.Date);
    readonly showHoldTransactions = signal(false);

    activeCardId$!: Observable<string>;
    clientInfo$!: Observable<IAccountInfo>;
    groups$!: Observable<ICategoryGroup[]>;
    transactions$!: Observable<ITransaction[]>;
    readonly ChartType = ChartType;

    // ── Spending Insights (bonus feature) ──
    readonly totalExpenses = computed(() => {
        const txs = this.transactions();
        return txs
            .filter(t => +t.amount < 0)
            .reduce((sum, t) => sum + this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode), 0);
    });

    readonly totalIncome = computed(() => {
        const txs = this.transactions();
        return txs
            .filter(t => +t.amount > 0)
            .reduce((sum, t) => sum + this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode), 0);
    });

    readonly biggestExpense = computed(() => {
        const txs = this.transactions().filter(t => +t.amount < 0);
        if (!txs.length) return null;
        return txs.reduce((max, tx) => {
            const txAmount = this.currencyDisplay.convertMinorAmount(tx.amount, tx.cardCurrencyCode);
            const maxAmount = this.currencyDisplay.convertMinorAmount(max.amount, max.cardCurrencyCode);
            return txAmount < maxAmount ? tx : max;
        }, txs[0]);
    });

    readonly averageDailySpend = computed(() => {
        const txs = this.transactions().filter(t => +t.amount < 0);
        if (!txs.length) return 0;
        const days = new Set(txs.map(t => new Date(t.time * 1000).toDateString())).size;
        const total = txs.reduce(
            (sum, t) => sum + Math.abs(this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode)),
            0,
        );
        return days > 0 ? total / days : 0;
    });

    readonly transactionCount = computed(() => this.transactions().length);
    readonly chartTransactions = computed(() =>
        this.transactions().map(transaction => this.currencyDisplay.convertTransactionForMinorUnitCharts(transaction))
    );

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

        // Ambient background-sync status (backfill progress, month freshness).
        this.syncStatus.start();
    }

    onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    /**
     * Kick off a full server-side backfill. Returns immediately; the worker drains
     * the queue in the background whether or not this tab stays open.
     */
    onBackfillClick(): void {
        if (this.syncStatus.isBackfilling()) {
            return;
        }
        this.syncStatus.startBackfill()
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ jobs }) => {
                    this.toast.success(`Backfill started — ${jobs} months queued. You can close the tab.`);
                    this.syncStatus.start();
                },
                error: () => this.toast.error('Could not start backfill. Try again.'),
            });
    }

    onSelectMonth(month: number): void {
        this.activeMonth = month;
        this.monobankService.activeMonth = month;
        if (this.transactionsRef) this.transactionsRef.activeMonth = month;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(month, this.activeYear, { includeHold: this.showHoldTransactions() })
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    onSelectYear(year: number): void {
        this.activeYear = year;
        this.monobankService.activeYear = year;
        if (this.transactionsRef) this.transactionsRef.activeYear = year;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(this.activeMonth, year, { includeHold: this.showHoldTransactions() })
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    toggleShowHold(): void {
        this.showHoldTransactions.update(v => !v);
        this.monobankService
            .getTransactions(this.activeMonth, this.activeYear, { includeHold: this.showHoldTransactions() })
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

    onOpenTransaction(transaction: ITransaction): void {
        this.monobankService.rememberTransaction(transaction);
        this.router.navigate(['/transactions', transaction.id], {
            state: { transaction },
        });
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
