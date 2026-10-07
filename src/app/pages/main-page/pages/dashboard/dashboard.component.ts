import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { categoryIndexOf, UNCATEGORIZED } from '@core/helpers/categorize';
import { currencyCodesMap } from '@core/data';
import { BETWEEN_ACCOUNTS_TITLE } from '@core/helpers/category-titles';
import { cancellationPairs, CountMode, flowOf, flowTotals } from '@core/helpers/flows';
import { IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
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
import { AccountSwitcherComponent } from './components/account-switcher/account-switcher.component';
import {
    AccountView, copyText, formatMoney, ownBalance, sortAccounts, toAccountView, toUah,
} from './components/account-switcher/accounts';
import { CategoryBreakdownComponent } from './components/category-breakdown/category-breakdown.component';
import { TransactionsComponent } from './components/transactions/transactions.component';

const MONTHS = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

/** Ukrainian plural: 1 операція, 2–4 операції, 5+ операцій (11–14 take the last form). */
function plural(n: number, forms: readonly [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

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
        OverlayModule,
        AccountSwitcherComponent, TransactionsComponent, CategoryBreakdownComponent, MonthPickerComponent, MonthPaceComponent,
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

    readonly BETWEEN_ACCOUNTS_TITLE = BETWEEN_ACCOUNTS_TITLE;

    readonly activeCardId = toSignal(this.monobankService.activeCardId$, { requireSync: true });

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

    /** Any money moved at all — an empty month draws no income/spend bar. */
    readonly hasFlow = computed(() => Math.abs(this.totalIncome()) + Math.abs(this.totalExpenses()) > 0);

    /** The sign follows the whole figure on screen: «+0 ₴» would claim income that is not there. */
    readonly netSign = computed(() => (Math.round(this.netTotal()) > 0 ? '+' : ''));

    /** Real spending only — a jar top-up or a cancelled order is never "the largest expense". */
    private readonly spendTxs = computed(() => {
        if (this.countMode() === 'all') return this.transactions().filter(t => +t.amount < 0);
        const ctx = this.flowContext();
        const groups = this.groupsSignal();
        const cancelled = cancellationPairs(this.transactions(), t => t);
        return this.transactions().filter(t => {
            if (flowOf(t, ctx) !== 'spend' || cancelled.has(t.id)) return false;
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
    readonly transactionCountLabel = computed(() => {
        const n = this.transactionCount();
        return `${n} ${plural(n, ['операція', 'операції', 'операцій'])}`;
    });
    readonly currency = computed(() => (this.transactions().length ? this.transactions()[0].cardCurrencyCode : 980));

    readonly periodLabel = computed(() => `${MONTHS[this.activeMonthSignal() - 1] ?? ''} ${this.activeYearSignal()}`);

    // ── Scoping (search + category) ──────────────────────────
    readonly searched = computed(() => this.searchPipe.transform(this.transactions(), this.searchValue()) ?? []);



    // ── Accounts ─────────────────────────────────────────────

    /** Every card, white first, with its own money worked out once for the hero and the switcher. */
    readonly accountViews = computed<AccountView[]>(() => {
        const rates = this.currencyDisplay.rates();
        return sortAccounts(this.clientInfoSignal()?.accounts ?? []).map(account => toAccountView(account, rates));
    });

    readonly activeAccount = computed(() => this.accountViews().find(a => a.id === this.activeCardId()) ?? null);

    /**
     * All the money that is yours, in hryvnias: every card's own balance (credit
     * limit left out, so a card in debt counts below zero) plus every jar. Dollars
     * and euros go through Monobank's rate. Null until the accounts — and, when
     * foreign money is involved, the rates — have arrived.
     */
    readonly worth = computed(() => {
        const info = this.clientInfoSignal();
        if (!info || !Array.isArray(info.accounts)) return null;
        const rates = this.currencyDisplay.rates();
        const jarsList = info.jars ?? [];
        const missing = new Set<string>();
        const add = (minor: number, code: number | undefined): number => {
            const currency = Number(code) || 980;
            const uah = toUah(Number(minor) || 0, currency, rates);
            if (uah === null) missing.add(currencyCodesMap[currency]?.name ?? String(currency));
            return uah ?? 0;
        };

        let cards = 0;
        for (const account of info.accounts) cards += add(ownBalance(account), account.currencyCode);
        let jars = 0;
        for (const jar of jarsList) jars += add(jar.balance, jar.currencyCode);

        if (missing.size && this.currencyDisplay.loading()) return null;
        return {
            total: formatMoney(cards + jars, 980, 0),
            cards: formatMoney(cards, 980, 0),
            jars: jarsList.length ? formatMoney(jars, 980, 0) : null,
            missing: missing.size ? `Без ${[...missing].join(', ')}: курс недоступний` : null,
        };
    });

    readonly WORTH_HINT = 'Власні кошти на всіх картках і в банках, без кредитного ліміту. Долари й євро — за курсом Монобанку.';

    /** The account whose IBAN was just copied: its button shows a check for a moment. */
    readonly copiedId = signal<string | null>(null);
    private copiedTimer: ReturnType<typeof setTimeout> | undefined;

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

        this.destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));
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
                    this.toast.success(
                        `Завантаження історії почалося: у черзі ${jobs} ${plural(jobs, ['місяць', 'місяці', 'місяців'])}. Вкладку можна закрити.`,
                    );
                    this.syncStatus.start();
                },
                error: () => this.toast.error('Не вдалося почати завантаження історії. Спробуйте ще раз.'),
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

    onChooseAccount(accountId: string): void {
        this.monobankService.setActiveCardId(accountId);
    }

    /**
     * Monobank's API never gives the full card number (only 444111******8813), so
     * the button copies what a transfer actually needs: the account's IBAN.
     */
    copyAccount(accountId: string): void {
        const account = this.accountViews().find(a => a.id === accountId);
        if (!account?.copyValue) return;
        copyText(account.copyValue).then(
            () => {
                this.toast.success(account.copyIsIban ? 'IBAN скопійовано' : 'Номер картки скопійовано');
                this.copiedId.set(accountId);
                clearTimeout(this.copiedTimer);
                this.copiedTimer = setTimeout(() => this.copiedId.set(null), 1600);
            },
            () => this.toast.error('Не вдалося скопіювати'),
        );
    }
}
