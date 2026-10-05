import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { categoryIndexOf, isCounted, UNCATEGORIZED } from '@core/helpers/categorize';
import { ChartType, LocalStorage } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, CurrencyDisplayService, MonobankService } from '@core/services';
import { SyncStatusService } from '@core/services/sync-status.service';
import { ToastService } from '@shared/components';
import { first, Observable } from 'rxjs';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { CardComponent, ChartComponent, TransactionsComponent } from './components';
import { CategoryBreakdownComponent } from './components/category-breakdown/category-breakdown.component';
import { UNCATEGORIZED_FILTER } from './components/transactions/transactions.component';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        AsyncPipe,
        CardComponent, ChartComponent, TransactionsComponent, CategoryBreakdownComponent,
        DisplayMoneyPipe, DisplayMoneyMajorPipe,
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
    private readonly searchPipe = new TransactionsFilterPipe();

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly categoryFilter = signal<string | null>(null);
    readonly showHoldTransactions = signal(this.monobankService.showHold);

    readonly clientInfoSignal = signal<IAccountInfo | null>(null);
    readonly groupsSignal = signal<ICategoryGroup[]>([]);
    readonly activeMonthSignal = signal(new Date().getMonth() + 1);
    readonly activeYearSignal = signal(new Date().getFullYear());

    activeCardId$!: Observable<string>;
    readonly ChartType = ChartType;

    activeMonth = new Date().getMonth() + 1;
    activeYear = new Date().getFullYear();

    // ── What counts ──────────────────────────────────────────
    /**
     * Transactions of categories marked "not spending" (jars, own cards) are left
     * out of every figure below, so a top-up to a jar never shows up as spending.
     */
    private readonly counted = computed(() => {
        const groups = this.groupsSignal();
        return this.transactions().filter(t => isCounted(t, groups));
    });

    /** Names of the categories currently left out — shown next to the figures. */
    readonly excludedNames = computed(() => {
        const groups = this.groupsSignal();
        const used = new Set<number>();
        for (const tx of this.transactions()) {
            const index = categoryIndexOf(tx, groups);
            if (index !== UNCATEGORIZED && groups[index]?.excluded) used.add(index);
        }
        return Array.from(used).map(index => groups[index].title);
    });

    readonly totalExpenses = computed(() =>
        this.counted()
            .filter(t => +t.amount < 0)
            .reduce((sum, t) => sum + this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode), 0),
    );

    readonly totalIncome = computed(() =>
        this.counted()
            .filter(t => +t.amount > 0)
            .reduce((sum, t) => sum + this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode), 0),
    );

    readonly biggestExpense = computed(() => {
        const txs = this.counted().filter(t => +t.amount < 0);
        if (!txs.length) return null;
        return txs.reduce((max, tx) =>
            this.currencyDisplay.convertMinorAmount(tx.amount, tx.cardCurrencyCode)
                < this.currencyDisplay.convertMinorAmount(max.amount, max.cardCurrencyCode) ? tx : max,
        txs[0]);
    });

    readonly averageDailySpend = computed(() => {
        const txs = this.counted().filter(t => +t.amount < 0);
        if (!txs.length) return 0;
        const days = new Set(txs.map(t => new Date(t.time * 1000).toDateString())).size;
        const total = txs.reduce(
            (sum, t) => sum + Math.abs(this.currencyDisplay.convertMinorAmount(t.amount, t.cardCurrencyCode)),
            0,
        );
        return days > 0 ? total / days : 0;
    });

    readonly transactionCount = computed(() => this.transactions().length);

    /** Net position for the period — the number the whole screen is about. */
    readonly netTotal = computed(() => this.totalIncome() + this.totalExpenses());

    /** Income's share of total flow, for the hero's proportional bar. */
    readonly incomeShare = computed(() => {
        const income = Math.abs(this.totalIncome());
        const spend = Math.abs(this.totalExpenses());
        const flow = income + spend;
        return flow > 0 ? Math.round((income / flow) * 100) : 0;
    });

    readonly uncategorizedCount = computed(() => {
        const groups = this.groupsSignal();
        return this.transactions().filter(t => categoryIndexOf(t, groups) === UNCATEGORIZED).length;
    });

    readonly periodLabel = computed(() => `${MONTHS[this.activeMonthSignal() - 1] ?? ''} ${this.activeYearSignal()}`);

    // ── Scoping (search + category) ──────────────────────────
    readonly searched = computed(() => this.searchPipe.transform(this.transactions(), this.searchValue()) ?? []);

    /** What the charts draw: the same slice the ledger shows. */
    readonly chartTransactions = computed(() => {
        const filter = this.categoryFilter();
        const groups = this.groupsSignal();
        let rows = this.searched();
        if (filter === UNCATEGORIZED_FILTER) rows = rows.filter(t => categoryIndexOf(t, groups) === UNCATEGORIZED);
        else if (filter !== null) rows = rows.filter(t => groups[categoryIndexOf(t, groups)]?.title === filter);
        return rows.map(t => this.currencyDisplay.convertTransactionForMinorUnitCharts(t));
    });

    readonly chartScope = computed(() => {
        const filter = this.categoryFilter();
        if (filter === null) return '';
        return filter === UNCATEGORIZED_FILTER ? ' · Uncategorized' : ` · ${filter}`;
    });

    // ── Accounts ─────────────────────────────────────────────
    readonly cardTypeFilters = signal<Set<string>>(this.loadCardTypeFilters());

    readonly availableCardTypes = computed(() => {
        const info = this.clientInfoSignal();
        if (!info?.accounts) return [];
        return Array.from(new Set(info.accounts.map(a => a.type).filter(Boolean)));
    });

    /** Sorted accounts: type='white' always first, filtered by chip selection */
    readonly sortedAccounts = computed(() => {
        const info = this.clientInfoSignal();
        if (!info?.accounts) return [];
        const filters = this.cardTypeFilters();
        const filtered = filters.size > 0 ? info.accounts.filter(a => filters.has(a.type)) : info.accounts;
        return [...filtered].sort((a, b) => {
            if (a.type === 'white' && b.type !== 'white') return -1;
            if (a.type !== 'white' && b.type === 'white') return 1;
            return 0;
        });
    });

    ngOnInit(): void {
        this.activeCardId$ = this.monobankService.activeCardId$;

        this.monobankService.currentTransactions$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(t => this.transactions.set(t ?? []));

        this.monobankService.clientInfo$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(info => this.clientInfoSignal.set(info));

        this.categoryGroupService.categoryGroups$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(groups => this.groupsSignal.set([...(groups ?? [])]));

        // Ambient background-sync status (backfill progress, month freshness).
        this.syncStatus.start();
    }

    // ── Period ───────────────────────────────────────────────

    /** Step the period by whole months, clamped to the current month. */
    stepPeriod(delta: number): void {
        let month = this.activeMonth + delta;
        let year = this.activeYear;
        if (month > 12) { month = 1; year++; }
        if (month < 1) { month = 12; year--; }

        const now = new Date();
        if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return;
        if (year < 2017) return;

        this.activeYear = year;
        this.activeYearSignal.set(year);
        this.monobankService.activeYear = year;
        this.onSelectMonth(month);
    }

    get canStepForward(): boolean {
        const now = new Date();
        return !(this.activeYear === now.getFullYear() && this.activeMonth === now.getMonth() + 1);
    }

    onSelectMonth(month: number): void {
        this.activeMonth = month;
        this.activeMonthSignal.set(month);
        this.monobankService.activeMonth = month;
        this.monobankService
            .getTransactions(month, this.activeYear, { includeHold: this.showHoldTransactions() })
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    toggleShowHold(): void {
        this.showHoldTransactions.update(v => !v);
        this.monobankService.setShowHold(this.showHoldTransactions());
        this.monobankService
            .getTransactions(this.activeMonth, this.activeYear, { includeHold: this.showHoldTransactions() })
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    /**
     * Kick off a full server-side backfill. Returns immediately; the worker drains
     * the queue in the background whether or not this tab stays open.
     */
    onBackfillClick(): void {
        if (this.syncStatus.isBackfilling()) return;
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

    // ── Ledger ───────────────────────────────────────────────

    onSearchTransaction(value: string): void {
        this.searchValue.set(value);
    }

    onCategoryFilter(filter: string | null): void {
        this.categoryFilter.set(filter);
    }

    showUncategorized(): void {
        this.categoryFilter.set(UNCATEGORIZED_FILTER);
    }

    onOpenTransaction(transaction: ITransaction): void {
        this.monobankService.rememberTransaction(transaction);
        this.router.navigate(['/transactions', transaction.id], { state: { transaction } });
    }

    // ── Accounts ─────────────────────────────────────────────

    onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    toggleCardTypeFilter(type: string): void {
        const current = new Set(this.cardTypeFilters());
        if (current.has(type)) current.delete(type);
        else current.add(type);
        this.cardTypeFilters.set(current);
        localStorage.setItem(LocalStorage.CardTypeFilters, JSON.stringify([...current]));
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
}
