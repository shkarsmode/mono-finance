import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { AsyncPipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { categoryIndexOf, UNCATEGORIZED } from '@core/helpers/categorize';
import { CountMode, flowOf, flowTotals } from '@core/helpers/flows';
import { LocalStorage } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, CurrencyDisplayService, MonobankService } from '@core/services';
import { CategoryMode } from '@core/services/category-group.service';
import { SyncStatusService } from '@core/services/sync-status.service';
import { MonthPickerComponent, ToastService } from '@shared/components';
import { first } from 'rxjs';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { MonthPaceComponent } from '../../../../shared/charts/month-pace.component';
import { TrendsService } from '@core/services/trends.service';
import { CardComponent, TransactionsComponent } from './components';
import { CategoryBreakdownComponent } from './components/category-breakdown/category-breakdown.component';
import { INTERNAL_FILTER, UNCATEGORIZED_FILTER } from './components/transactions/transactions.component';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2024-06" ⇄ { year: 2024, month: 6 } — the period lives in the URL too. */
function parsePeriod(value: string | null): { month: number; year: number } | null {
    const match = /^(\d{4})-(\d{1,2})$/.exec(value ?? '');
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || year < 2017) return null;
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return null;
    return { month, year };
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        AsyncPipe, OverlayModule,
        CardComponent, TransactionsComponent, CategoryBreakdownComponent, MonthPickerComponent, MonthPaceComponent,
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
    private readonly route = inject(ActivatedRoute);
    private readonly location = inject(Location);
    readonly currencyDisplay = inject(CurrencyDisplayService);
    readonly syncStatus = inject(SyncStatusService);
    private readonly toast = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly searchPipe = new TransactionsFilterPipe();
    private readonly trends = inject(TrendsService);

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly categoryFilter = signal<string | null>(null);

    readonly clientInfoSignal = signal<IAccountInfo | null>(null);
    readonly groupsSignal = signal<ICategoryGroup[]>([]);
    readonly activeMonthSignal = signal(this.monobankService.activeMonth);
    readonly activeYearSignal = signal(this.monobankService.activeYear);

    readonly categoryMode = toSignal(this.categoryGroupService.mode$, { requireSync: true });
    readonly countMode = toSignal(this.categoryGroupService.countMode$, { requireSync: true });
    private readonly flowContext = toSignal(this.categoryGroupService.flowContext$, { requireSync: true });

    activeCardId$ = this.monobankService.activeCardId$;

    // ── Honest totals ────────────────────────────────────────

    /**
     * 'real' leaves out money that only changed pockets (own jars, own cards,
     * deposits, your accounts at other banks) and nets refunds against spending;
     * 'all' is the raw statement. Categories marked "not counted" drop out too.
     */
    readonly totals = computed(() => {
        const groups = this.groupsSignal();
        const skip = (tx: ITransaction) => {
            const index = categoryIndexOf(tx, groups);
            return index !== UNCATEGORIZED && !!groups[index]?.excluded;
        };
        return flowTotals(this.transactions(), this.flowContext(), this.countMode(), skip);
    });

    /** Minor units of the card's currency → major units of the chosen display currency. */
    private readonly major = (minor: number) => this.currencyDisplay.convertMinorAmount(minor, this.currency());

    readonly totalExpenses = computed(() => -this.major(this.totals().spent));
    readonly totalIncome = computed(() => this.major(this.totals().income));
    readonly netTotal = computed(() => this.totalIncome() + this.totalExpenses());
    readonly internalOut = computed(() => this.major(this.totals().internalOut));
    readonly internalIn = computed(() => this.major(this.totals().internalIn));

    readonly incomeShare = computed(() => {
        const income = Math.abs(this.totalIncome());
        const spend = Math.abs(this.totalExpenses());
        const flow = income + spend;
        return flow > 0 ? Math.round((income / flow) * 100) : 0;
    });

    /** Real spending only — a jar top-up is never "the largest expense". */
    private readonly spendTxs = computed(() => {
        if (this.countMode() === 'all') return this.transactions().filter(t => +t.amount < 0);
        const ctx = this.flowContext();
        const groups = this.groupsSignal();
        return this.transactions().filter(t => {
            if (flowOf(t, ctx) !== 'spend') return false;
            const index = categoryIndexOf(t, groups);
            return index === UNCATEGORIZED || !groups[index]?.excluded;
        });
    });

    readonly biggestExpense = computed(() => {
        const txs = this.spendTxs();
        return txs.length ? txs.reduce((max, tx) => (tx.amount < max.amount ? tx : max), txs[0]) : null;
    });

    readonly averageDailySpend = computed(() => {
        const txs = this.spendTxs();
        if (!txs.length) return 0;
        const days = new Set(txs.map(t => new Date(t.time * 1000).toDateString())).size;
        return days > 0 ? this.major(this.totals().spent) / days : 0;
    });

    readonly transactionCount = computed(() => this.transactions().length);
    readonly currency = computed(() => (this.transactions().length ? this.transactions()[0].cardCurrencyCode : 980));

    readonly periodLabel = computed(() => `${MONTHS[this.activeMonthSignal() - 1] ?? ''} ${this.activeYearSignal()}`);

    // ── Scoping (search + category) ──────────────────────────
    readonly searched = computed(() => this.searchPipe.transform(this.transactions(), this.searchValue()) ?? []);



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
        this.monobankService.currentTransactions$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(t => this.transactions.set(t ?? []));

        this.monobankService.clientInfo$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(info => this.clientInfoSignal.set(info));

        this.categoryGroupService.categoryGroups$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(groups => this.groupsSignal.set([...(groups ?? [])]));

        // The period: the URL wins (reload, shared link), else whatever the app was
        // already looking at — so coming back from a transaction keeps the month.
        const fromUrl = parsePeriod(this.route.snapshot.queryParamMap.get('month'));
        const target = fromUrl ?? { month: this.monobankService.activeMonth, year: this.monobankService.activeYear };
        this.applyPeriod(target.month, target.year, !this.monobankService.isLoaded(target.month, target.year));

        // A year of history: the pace chart's "usual" line and the app-wide category colours.
        this.monobankService.activeCardId$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(id => this.trends.ensure(id));

        // Ambient background-sync status (backfill progress, month freshness).
        this.syncStatus.start();
    }

    // ── Period ───────────────────────────────────────────────

    readonly pickerOpen = signal(false);
    readonly pickerPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    ];

    /** Step the period by whole months, clamped to the current month. */
    stepPeriod(delta: number): void {
        let month = this.activeMonthSignal() + delta;
        let year = this.activeYearSignal();
        if (month > 12) { month = 1; year++; }
        if (month < 1) { month = 12; year--; }

        const now = new Date();
        if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return;
        if (year < 2017) return;
        this.applyPeriod(month, year, true);
    }

    onPickMonth(period: { month: number; year: number }): void {
        this.pickerOpen.set(false);
        if (period.month === this.activeMonthSignal() && period.year === this.activeYearSignal()) return;
        this.applyPeriod(period.month, period.year, true);
    }

    get canStepForward(): boolean {
        const now = new Date();
        return !(this.activeYearSignal() === now.getFullYear() && this.activeMonthSignal() === now.getMonth() + 1);
    }

    private applyPeriod(month: number, year: number, fetch: boolean): void {
        this.activeMonthSignal.set(month);
        this.activeYearSignal.set(year);
        this.monobankService.setPeriod(month, year);
        this.categoryFilter.set(null);

        const now = new Date();
        const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
        // Rewrite the address quietly. A router navigation here started a view
        // transition on every arrow click, and while it ran the page was covered by its
        // snapshot: the 2nd and 3rd fast clicks hit the snapshot instead of the arrow,
        // so they were lost and the browser selected text instead.
        const tree = this.router.createUrlTree([], {
            relativeTo: this.route,
            queryParams: { month: isCurrent ? null : `${year}-${String(month).padStart(2, '0')}` },
            queryParamsHandling: 'merge',
        });
        this.location.replaceState(this.router.serializeUrl(tree));

        if (fetch) {
            this.monobankService
                .getTransactions(month, year)
                .pipe(first(), takeUntilDestroyed(this.destroyRef))
                .subscribe();
        }
    }

    setCountMode(mode: CountMode): void {
        this.categoryGroupService.setCountMode(mode);
    }

    setCategoryMode(mode: CategoryMode): void {
        this.categoryFilter.set(null);
        this.categoryGroupService.setMode(mode);
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
