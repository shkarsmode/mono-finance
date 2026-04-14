import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ChartType, LocalStorage, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, CurrencyDisplayService, MonobankService } from '@core/services';
import { first, firstValueFrom, lastValueFrom, Observable, Subject } from 'rxjs';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from '../../../../shared/pipes/transactions-sort-by.pipe';
import {
    CardComponent, CategoryManagerComponent, ChartComponent, TransactionsComponent
} from './components';
import { FloatingToolbarComponent } from './components/floating-toolbar/floating-toolbar.component';

type BulkNarration = {
    eyebrow: string;
    title: string;
    subtitle: string;
    icon: string;
};

type BulkLoadMeta = {
    isUpToDate?: boolean;
    nextAllowedAt?: number;
    retryAfterSec?: number;
    syncMode?: 'fresh-cache' | 'live' | 'cache-fallback';
};

type BulkLoadResult = {
    data?: ITransaction[];
    meta?: BulkLoadMeta;
    syncMeta?: BulkLoadMeta;
};

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
    private readonly bulkMonoCooldownSec = 60;
    private readonly monobankService = inject(MonobankService);
    private readonly categoryGroupService = inject(CategoryGroupService);
    private readonly router = inject(Router);
    readonly currencyDisplay = inject(CurrencyDisplayService);
    private readonly destroyRef = inject(DestroyRef);

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly sortDirection = signal<'asc' | 'desc'>('desc');
    readonly sortBy = signal<TransactionSortBy>(TransactionSortBy.Date);
    readonly isBulkLoading = signal(false);
    readonly processedMonths = signal(0);
    readonly emptyStreak = signal(0);
    readonly rateLimitLeftSec = signal(0);
    readonly showHoldTransactions = signal(false);
    readonly maxEmptyStreak = 2;
    readonly bulkTargetMonths = signal(1);
    readonly bulkCurrentMonthValue = signal(new Date().getMonth() + 1);
    readonly bulkCurrentYearValue = signal(new Date().getFullYear());
    readonly bulkNarration = signal<BulkNarration>({
        eyebrow: 'Deep Sync Mode',
        title: 'Opening the ledger vault',
        subtitle: 'Preparing archived statements for a full sweep.',
        icon: 'travel_explore',
    });
    readonly bulkLatestCount = signal(0);
    readonly bulkLastOutcome = signal('Waiting for the first archive pass.');

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

    get bulkProgressPercent(): number {
        const total = Math.max(1, this.bulkTargetMonths());
        return Math.max(0, Math.min(100, Math.round(this.processedMonths() / total * 100)));
    }

    async onLoadAllClick(): Promise<void> {
        if (this.isBulkLoading() || this.rateLimitLeftSec() > 0) return;

        const startYear = this.monobankService.activeYear;
        const startMonth = this.monobankService.activeMonth;

        this.isBulkLoading.set(true);
        this.cancelBulkRequested = false;
        this.processedMonths.set(0);
        this.emptyStreak.set(0);
        this.bulkTargetMonths.set(this.countBulkTargetMonths(startMonth, startYear));
        this.bulkLatestCount.set(0);
        this.bulkCurrentMonthValue.set(startMonth);
        this.bulkCurrentYearValue.set(startYear);
        this.bulkNarration.set({
            eyebrow: 'Deep Sync Mode',
            title: 'Opening the ledger vault',
            subtitle: `Aligning the scanner with ${this.getPeriodLabel(startMonth, startYear)}.`,
            icon: 'travel_explore',
        });
        this.bulkLastOutcome.set('Starting a fresh sweep through archived months.');

        try {
            let y = startYear;
            let m = startMonth;

            while (
                !this.cancelBulkRequested &&
                this.emptyStreak() < this.maxEmptyStreak &&
                this.processedMonths() < 240 &&
                y >= 2015
            ) {
                try {
                    this.bulkCurrentMonthValue.set(m);
                    this.bulkCurrentYearValue.set(y);
                    this.bulkNarration.set(this.createScanningNarration(m, y));
                    this.bulkLastOutcome.set(`Requesting live statements for ${this.getPeriodLabel(m, y)}.`);

                    const syncResult = await lastValueFrom(
                        this.monobankService.syncTransactionsMonth(
                            m,
                            y,
                            { silent: true },
                        ).pipe(first())
                    );

                    const syncMeta = syncResult?.meta;
                    if (syncMeta?.isUpToDate === false) {
                        this.bulkNarration.set({
                            eyebrow: 'Mono Cooldown',
                            title: 'Mono is catching its breath',
                            subtitle: `We already have a cached snapshot for ${this.getPeriodLabel(m, y)}. Waiting ${this.bulkMonoCooldownSec}s before retrying this same month.`,
                            icon: 'schedule',
                        });
                        this.bulkLastOutcome.set(`Cached fallback detected for ${this.getPeriodLabel(m, y)}. Retrying after cooldown.`);
                        await this.waitForSeconds(this.bulkMonoCooldownSec);
                        continue;
                    }

                    const result = await lastValueFrom(
                        this.monobankService.getTransactions(
                            m,
                            y,
                            {
                                includeHold: this.showHoldTransactions(),
                                silent: true,
                            },
                        ).pipe(first())
                    );

                    const data = result?.data ?? [];
                    this.bulkLatestCount.set(Array.isArray(data) ? data.length : 0);
                    if (Array.isArray(data) && data.length > 0) {
                        this.emptyStreak.set(0);
                        this.monobankService.mergeTransactions(data);
                        this.bulkNarration.set({
                            eyebrow: 'Archive Captured',
                            title: `${data.length} transactions just flew in`,
                            subtitle: `${this.getPeriodLabel(m, y)} is now glowing with fresh statement data.`,
                            icon: 'auto_awesome',
                        });
                        this.bulkLastOutcome.set(`Captured ${data.length} transactions in ${this.getPeriodLabel(m, y)}.`);
                    } else {
                        this.emptyStreak.update(v => v + 1);
                        this.bulkNarration.set({
                            eyebrow: 'Quiet Airspace',
                            title: 'This month looks calm',
                            subtitle: `${this.getPeriodLabel(m, y)} came back nearly silent, but it has been checked live.`,
                            icon: 'air',
                        });
                        this.bulkLastOutcome.set(`No new visible transactions for ${this.getPeriodLabel(m, y)}.`);
                    }

                    const nextPeriod = this.getPreviousPeriod(m, y);
                    this.bulkNarration.set({
                        eyebrow: 'Cooling The Engines',
                        title: 'Preparing the next archive jump',
                        subtitle: `Mono cooldown is fixed at ${this.bulkMonoCooldownSec}s. Next stop: ${this.getPeriodLabel(nextPeriod.month, nextPeriod.year)}.`,
                        icon: 'hourglass_top',
                    });
                    this.bulkLastOutcome.set('Holding a full 60-second cooldown before the next Mono sync.');
                    await this.waitForSeconds(this.bulkMonoCooldownSec);
                } catch (err: any) {
                    // On rate limit error, wait and retry this same month
                    if (err?.status === 429 || (err?.error?.message ?? '').toString().toLowerCase().includes('too many')) {
                        this.bulkNarration.set({
                            eyebrow: 'Rate Limit Shield',
                            title: 'Mono asked us to slow down',
                            subtitle: `Cooldown detected while syncing ${this.getPeriodLabel(m, y)}. Waiting ${this.bulkMonoCooldownSec}s and retrying the same month.`,
                            icon: 'shield',
                        });
                        this.bulkLastOutcome.set(`Rate limit hit for ${this.getPeriodLabel(m, y)}. Holding position.`);
                        await this.waitForSeconds(this.bulkMonoCooldownSec);
                        continue; // retry same month
                    }
                    // For non-429 errors, skip this month
                    this.bulkNarration.set({
                        eyebrow: 'Skip And Continue',
                        title: 'This month refused to cooperate',
                        subtitle: `Skipping ${this.getPeriodLabel(m, y)} after an unexpected error and moving deeper into the archive.`,
                        icon: 'error_outline',
                    });
                    this.bulkLastOutcome.set(`Skipped ${this.getPeriodLabel(m, y)} because of an unexpected error.`);
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
            if (this.cancelBulkRequested) {
                this.bulkNarration.set({
                    eyebrow: 'Sync Paused',
                    title: 'Deep sync was cancelled',
                    subtitle: 'The archive sweep stopped safely. You can resume from the current month anytime.',
                    icon: 'pause_circle',
                });
                this.bulkLastOutcome.set('Cancelled by user.');
            }
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

    private getBulkSyncMeta(result: BulkLoadResult | null | undefined): BulkLoadMeta | undefined {
        return result?.syncMeta ?? result?.meta;
    }

    private async waitForSeconds(seconds: number): Promise<void> {
        if (seconds <= 0) {
            return;
        }

        this.rateLimitLeftSec.set(seconds);
        try {
            await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        } finally {
            this.rateLimitLeftSec.set(0);
        }
    }

    readonly bulkCurrentPeriodLabel = computed(() =>
        this.getPeriodLabel(this.bulkCurrentMonthValue(), this.bulkCurrentYearValue())
    );

    readonly bulkProgressLabel = computed(() =>
        `${this.processedMonths()} of ${this.bulkTargetMonths()} archived months scanned`
    );

    readonly bulkAmbientLabel = computed(() => {
        if (this.rateLimitLeftSec() > 0) {
            return `Mono cooldown ${this.rateLimitLeftSec()}s`;
        }
        if (this.emptyStreak() > 0) {
            return `${this.emptyStreak()} quiet month${this.emptyStreak() > 1 ? 's' : ''} in a row`;
        }
        if (this.bulkLatestCount() > 0) {
            return `${this.bulkLatestCount()} transactions in the latest pass`;
        }
        return 'Live sync in motion';
    });

    readonly bulkHighlightChips = computed(() => [
        this.bulkCurrentPeriodLabel(),
        `${this.emptyStreak()} empty streak`,
        `${this.processedMonths()} months done`,
        this.rateLimitLeftSec() > 0 ? `Cooldown ${this.rateLimitLeftSec()}s` : 'Mono channel open',
    ]);

    private createScanningNarration(month: number, year: number): BulkNarration {
        const moods: BulkNarration[] = [
            {
                eyebrow: 'Statement Radar',
                title: 'Sweeping the archive sky',
                subtitle: `Searching ${this.getPeriodLabel(month, year)} for hidden transfers, cashback sparks and card swipes.`,
                icon: 'radar',
            },
            {
                eyebrow: 'Receipt Telescope',
                title: 'Zooming into forgotten payments',
                subtitle: `Reading the tiny constellations inside ${this.getPeriodLabel(month, year)}.`,
                icon: 'travel_explore',
            },
            {
                eyebrow: 'Ledger Drift',
                title: 'Catching transactions mid-flight',
                subtitle: `Crossing ${this.getPeriodLabel(month, year)} with a full live sync pass from Mono.`,
                icon: 'air',
            },
            {
                eyebrow: 'Cashflow Aurora',
                title: 'Lighting up the monthly timeline',
                subtitle: `Watching income and spending traces wake up inside ${this.getPeriodLabel(month, year)}.`,
                icon: 'auto_awesome',
            },
        ];
        return moods[this.processedMonths() % moods.length];
    }

    private countBulkTargetMonths(month: number, year: number): number {
        return ((year - 2015) * 12) + month;
    }

    private getPreviousPeriod(month: number, year: number): { month: number; year: number } {
        if (month > 1) {
            return { month: month - 1, year };
        }
        return { month: 12, year: year - 1 };
    }

    private getPeriodLabel(month: number, year: number): string {
        const monthName = this.monthsMap.find(item => item.value === month)?.name ?? `M${month}`;
        return `${monthName} ${year}`;
    }
}
