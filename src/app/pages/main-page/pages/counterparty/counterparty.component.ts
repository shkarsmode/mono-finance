import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { currencyCodesMap } from '@core/data';
import { cardName } from '@core/helpers/card-names';
import { cancellationPairs, flowOf, isPendingHold } from '@core/helpers/flows';
import { IAccount, IAccountInfo } from '@core/interfaces';
import { CategoryGroupService } from '@core/services/category-group.service';
import {
    COUNTERPARTY_MONTHS, counterpartyBase, counterpartyKey, counterpartyMatcher, counterpartyTitle, CounterpartyHistoryService,
    CounterpartyRow,
} from '@core/services/counterparty-history.service';
import { CurrencyDisplayService } from '@core/services/currency-display.service';
import { MonobankService } from '@core/services/monobank.service';
import { TransactionStore } from '@core/store/transaction-store.service';
import { map, Observable } from 'rxjs';
import { currencySign, fullMoney } from '../../../../shared/charts/chart-utils';
import { CounterpartyChartComponent, CounterpartyMonth } from './counterparty-chart.component';

const MONTH_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const MONTH_NAME = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

/** One operation with the party, ready for the list. */
interface Op {
    id: string;
    time: number;
    accountId: string;
    /** «Біла», «Чорна · $». */
    card: string;
    incoming: boolean;
    /** Exact, in the card's own currency: «−1 250,50 ₴», «+20 $». */
    amountText: string;
    /** Minor units of the display currency; null when there is no rate to convert with. */
    value: number | null;
    /** «≈ −830 ₴» when the card is in another currency. */
    convertedText: string;
    comment: string;
    /** The row's own wording when it is not the heading's — «Від: Олександр Мельник», «414960****3701». */
    variant: string;
    /** A fresh hold, still being processed. */
    pending: boolean;
    /** Money a merchant gave back: it comes off what went to them, it is not money from them. */
    refund: boolean;
    /** A cancelled order, or the refund that cancelled it: the pair adds up to zero and counts nowhere. */
    cancelled: boolean;
    /** «2026-10». */
    monthKey: string;
}

interface MonthGroup {
    key: string;
    /** «Жовтень 2026». */
    title: string;
    ops: Op[];
    /** Operations that really happened: cancelled orders and their refunds left out. */
    count: number;
    received: number;
    spent: number;
}

/** Sums over a run of operations: refunds come off spending, a cancelled pair counts nowhere. */
interface Tally {
    spent: number;
    received: number;
    outCount: number;
    inCount: number;
    /** Charges a refund took back in full. */
    cancelled: number;
    outValued: number;
    inValued: number;
}

function tally(ops: readonly Op[]): Tally {
    const t: Tally = { spent: 0, received: 0, outCount: 0, inCount: 0, cancelled: 0, outValued: 0, inValued: 0 };
    for (const op of ops) {
        if (op.cancelled) {
            if (!op.incoming) t.cancelled++;
        } else if (op.refund) {
            if (op.value !== null) t.spent -= op.value;
        } else if (op.incoming) {
            t.inCount++;
            if (op.value !== null) { t.received += op.value; t.inValued++; }
        } else {
            t.outCount++;
            if (op.value !== null) { t.spent += -op.value; t.outValued++; }
        }
    }
    // a refund for an order from before the window has nothing to come off
    t.spent = Math.max(0, t.spent);
    return t;
}

type PageState = 'no-query' | 'loading' | 'error' | 'own' | 'empty' | 'ready';

/** Ukrainian plural: 1 операція, 2–4 операції, 5+ операцій (11–14 take the last form). `forms` holds those three. */
function plural(n: number, forms: readonly string[]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

function monthKey(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

function moneySign(code: number): string {
    if (code === 980 || code === 840 || code === 978 || code === 985) return currencySign(code);
    return currencyCodesMap[code]?.name ?? String(code);
}

/** Exact, in a card's own currency, kopecks only when there are any: «−1 250,50 ₴», «+500 ₴». */
function exactMoney(minor: number, code: number): string {
    const abs = Math.abs(minor);
    const digits = abs % 100 === 0 ? 0 : 2;
    const value = (abs / 100).toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${minor < 0 ? '−' : minor > 0 ? '+' : ''}${value} ${moneySign(code)}`;
}

/**
 * «Олена А. за всі місяці»: everything exchanged with one party over two years, on
 * every card — what came from them, what went to them, month by month, and every
 * operation. Money that only moved between your own accounts is left out.
 */
@Component({
    selector: 'app-counterparty',
    standalone: true,
    imports: [DatePipe, RouterLink, CounterpartyChartComponent],
    templateUrl: './counterparty.component.html',
    styleUrl: './counterparty.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CounterpartyComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly location = inject(Location);
    private readonly monobank = inject(MonobankService);
    private readonly categories = inject(CategoryGroupService);
    private readonly currencyDisplay = inject(CurrencyDisplayService);
    private readonly store = inject(TransactionStore);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    public readonly data = inject(CounterpartyHistoryService);

    public readonly MONTHS = COUNTERPARTY_MONTHS;

    private readonly query = toSignal(
        this.route.queryParamMap.pipe(map(params => (params.get('q') ?? '').trim())),
        { initialValue: (this.route.snapshot.queryParamMap.get('q') ?? '').trim() },
    );
    private readonly info = toSignal(this.monobank.clientInfo$ as Observable<IAccountInfo | null>, { initialValue: null });
    private readonly flowContext = toSignal(this.categories.flowContext$, { requireSync: true });

    public readonly title = computed(() => counterpartyTitle(this.query()));
    private readonly accounts = computed<IAccount[]>(() => this.info()?.accounts ?? []);
    private readonly accountsKnown = computed(() => Array.isArray(this.info()?.accounts));

    /** Every sum on the page is in the app's display currency — hryvnias unless the profile says otherwise. */
    public readonly displayCode = computed(() => this.currencyDisplay.selectedNumericCode());
    private readonly sign = computed(() => currencySign(this.displayCode()));

    /** The party's rows; own-money moves only counted, for the empty state. */
    private readonly matched = computed(() => {
        const match = counterpartyMatcher(this.query());
        const ctx = this.flowContext();
        const real: CounterpartyRow[] = [];
        let own = 0;
        for (const row of this.data.rows()) {
            if (!match(row.key)) continue;
            if (flowOf(row.tx, ctx) === 'internal') own++;
            else real.push(row);
        }
        return { real, own };
    });

    private readonly needsRates = computed(() => {
        const display = this.displayCode();
        return this.matched().real.some(row => row.currencyCode !== display);
    });
    private readonly ratesPending = computed(() =>
        this.needsRates() && !this.currencyDisplay.rates().length && this.currencyDisplay.loading(),
    );
    public readonly ratesMissing = computed(() =>
        this.needsRates() && !this.currencyDisplay.rates().length && !this.currencyDisplay.loading(),
    );

    /** «Біла», «Чорна · $»; the last four digits only when two cards would read the same. */
    private readonly cardLabels = computed(() => {
        const accounts = this.accounts();
        const base = accounts.map(a =>
            a.currencyCode && a.currencyCode !== 980 ? `${cardName(a.type)} · ${moneySign(a.currencyCode)}` : cardName(a.type),
        );
        const uses = new Map<string, number>();
        for (const label of base) uses.set(label, (uses.get(label) ?? 0) + 1);
        return new Map<string, string>(accounts.map((a, i) => {
            const tail = (a.maskedPan?.[0] ?? '').replace(/\D/g, '').slice(-4);
            return [a.id, (uses.get(base[i]) ?? 0) > 1 && tail ? `${base[i]} ·${tail}` : base[i]];
        }));
    });

    /** Newest first. */
    public readonly ops = computed<Op[]>(() => {
        const display = this.displayCode();
        const ratesReady = this.currencyDisplay.rates().length > 0;
        const sign = this.sign();
        const cards = this.cardLabels();
        const heading = counterpartyBase(counterpartyKey(this.query()));
        const comments = new Map<string, Map<string, string>>();
        const nowSec = Date.now() / 1000;
        const ctx = this.flowContext();
        const real = this.matched().real;
        const pairs = cancellationPairs(real, row => row.tx, row => row.accountId);

        return real
            .map(row => {
                const tx = row.tx;
                const amount = Number(tx.amount) || 0;
                const date = new Date(tx.time * 1000);
                const same = row.currencyCode === display;
                const value = same
                    ? amount
                    : ratesReady ? this.currencyDisplay.convertMinorAmountToMinorUnits(amount, row.currencyCode) : null;
                return {
                    id: tx.id,
                    time: tx.time,
                    accountId: row.accountId,
                    card: cards.get(row.accountId) ?? 'Картка',
                    incoming: amount > 0,
                    amountText: exactMoney(amount, row.currencyCode),
                    value,
                    convertedText: same || value === null ? '' : `≈ ${this.signed(value, sign)}`,
                    comment: (tx.comment || this.cachedComment(row, comments)).trim(),
                    variant: counterpartyBase(row.key) !== heading ? (tx.description ?? '').trim() : '',
                    pending: isPendingHold(tx, nowSec),
                    refund: flowOf(tx, ctx) === 'refund',
                    cancelled: pairs.has(tx.id),
                    monthKey: monthKey(date.getFullYear(), date.getMonth() + 1),
                };
            })
            .sort((a, b) => b.time - a.time);
    });

    public readonly totals = computed(() => {
        const ops = this.ops();
        const t = tally(ops);
        const happened = ops.filter(op => !op.cancelled);
        return {
            spent: t.spent,
            received: t.received,
            net: t.received - t.spent,
            count: happened.length,
            outCount: t.outCount,
            inCount: t.inCount,
            cancelled: t.cancelled,
            // per spending operation; a party that only ever paid you gets the average payment instead
            average: t.outValued ? { value: t.spent / t.outValued, per: 'out' as const }
                : t.inValued ? { value: t.received / t.inValued, per: 'in' as const } : null,
            first: ops.length ? ops[ops.length - 1].time : 0,
            last: ops.length ? ops[0].time : 0,
            activeMonths: new Set(happened.map(op => op.monthKey)).size,
        };
    });

    /** The 24 full months and the running one, oldest first. */
    public readonly months = computed<CounterpartyMonth[]>(() => {
        const now = new Date();
        const slots = Array.from({ length: COUNTERPARTY_MONTHS + 1 }, (_, i): CounterpartyMonth => {
            const d = new Date(now.getFullYear(), now.getMonth() - COUNTERPARTY_MONTHS + i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            return {
                key: monthKey(year, month), year, month,
                label: MONTH_SHORT[month - 1], name: MONTH_NAME[month - 1],
                partial: i === COUNTERPARTY_MONTHS,
                received: 0, spent: 0, count: 0,
            };
        });
        const at = new Map(slots.map((slot, i) => [slot.key, i]));
        for (const group of this.groups()) {
            const slot = slots[at.get(group.key) ?? -1];
            if (!slot) continue;
            slot.count = group.count;
            slot.received = group.received;
            slot.spent = group.spent;
        }
        return slots;
    });

    /** The list, a month at a time, newest first, each with its subtotals. */
    public readonly groups = computed<MonthGroup[]>(() => {
        const groups: MonthGroup[] = [];
        for (const op of this.ops()) {
            let group = groups[groups.length - 1];
            if (!group || group.key !== op.monthKey) {
                const [year, month] = op.monthKey.split('-').map(Number);
                group = { key: op.monthKey, title: `${MONTH_NAME[month - 1]} ${year}`, ops: [], count: 0, received: 0, spent: 0 };
                groups.push(group);
            }
            group.ops.push(op);
        }
        for (const group of groups) {
            const t = tally(group.ops);
            group.count = group.ops.filter(op => !op.cancelled).length;
            group.received = t.received;
            group.spent = t.spent;
        }
        return groups;
    });

    public readonly state = computed<PageState>(() => {
        if (!this.query()) return 'no-query';
        if (!this.accountsKnown()) return 'loading';
        if (!this.accounts().length) return 'empty';
        if (!this.data.settled()) return 'loading';
        if (!this.data.hasData()) return 'error';
        if (this.ratesPending()) return 'loading';
        if (!this.ops().length) return this.matched().own ? 'own' : 'empty';
        return 'ready';
    });

    public readonly subtitle = computed(() => {
        const parts = [`За ${COUNTERPARTY_MONTHS} місяці`, 'усі картки'];
        const display = this.displayCode();
        const foreign = Array.from(new Set(
            this.matched().real.filter(row => row.currencyCode !== display).map(row => moneySign(row.currencyCode)),
        ));
        if (foreign.length) parts.push(`${foreign.join(' і ')} — за поточним курсом`);
        if (this.matched().own) parts.push('без переказів між вашими рахунками');
        if (this.ops().some(op => op.refund)) parts.push('повернення віднято від витрат');
        return parts.join(' · ');
    });

    /** Other spellings the totals include, so a merge is never silent: «Від: Олександр Мельник». */
    public readonly merged = computed(() => {
        const spellings = Array.from(new Set(this.ops().map(op => op.variant).filter(Boolean)));
        if (!spellings.length) return '';
        const shown = spellings.slice(0, 3).map(s => `«${s}»`).join(', ');
        return spellings.length > 3 ? `${shown} і ще ${spellings.length - 3}` : shown;
    });

    public readonly failedCards = computed(() => {
        const cards = this.cardLabels();
        return this.data.failedIds().map(id => cards.get(id) ?? 'Картка');
    });

    /** The month the chart just pointed at, marked in the list for a moment. */
    public readonly highlight = signal<string | null>(null);
    private highlightTimer?: ReturnType<typeof setTimeout>;

    constructor() {
        this.monobank.clientInfo$
            .pipe(takeUntilDestroyed())
            .subscribe((info: IAccountInfo | null) => {
                const accounts = info?.accounts;
                if (!accounts?.length) return;
                this.data.ensure(accounts);
                const display = this.currencyDisplay.selectedNumericCode();
                if (accounts.some(a => a.currencyCode !== display)
                    && !this.currencyDisplay.rates().length && !this.currencyDisplay.loading()) {
                    this.currencyDisplay.refreshRates();
                }
            });

        inject(DestroyRef).onDestroy(() => clearTimeout(this.highlightTimer));
    }

    /** Back to the transaction this was opened from; a page opened from a link goes to Динаміка. */
    public goBack(): void {
        if ((history.state?.navigationId ?? 1) > 1) this.location.back();
        else this.router.navigate(['/trends']);
    }

    public retry(): void {
        this.data.ensure(this.accounts());
        if (this.ratesMissing()) this.currencyDisplay.refreshRates(true);
    }

    /** A click on a chart month: jump to its operations and mark them. */
    public showMonth(key: string): void {
        const rule = this.host.nativeElement.querySelector<HTMLElement>(`[data-month="${key}"]`);
        if (!rule) return;
        rule.scrollIntoView({ block: 'start' });
        this.highlight.set(key);
        clearTimeout(this.highlightTimer);
        this.highlightTimer = setTimeout(() => this.highlight.set(null), 1600);
    }

    /**
     * The row's link opens its month on the dashboard. The dashboard shows ONE card,
     * so a plain click also makes the row's card the active one — otherwise the
     * operation would not be in the list it opens. A new tab is left alone.
     */
    public openOp(event: MouseEvent, op: Op): void {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const [year, month] = op.monthKey.split('-').map(Number);
        this.monobank.setPeriod(month, year);
        this.monobank.setActiveCardId(op.accountId);
    }

    public money(minor: number): string {
        return fullMoney(minor, this.sign());
    }

    public signed(minor: number, sign = this.sign()): string {
        const text = fullMoney(minor, sign);
        return minor > 0 ? `+${text}` : text;
    }

    /** «3 операції» — `forms` are the 1 / 2–4 / 5+ forms. */
    public count(n: number, forms: readonly string[]): string {
        return `${n} ${plural(n, forms)}`;
    }

    /** «сьогодні», «вчора», «4 дні тому», «3 місяці тому». */
    public ago(timeSec: number): string {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const day = new Date(timeSec * 1000);
        day.setHours(0, 0, 0, 0);
        const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
        if (days <= 0) return 'сьогодні';
        if (days === 1) return 'вчора';
        if (days < 31) return `${this.count(days, ['день', 'дні', 'днів'])} тому`;
        return `${this.count(Math.round(days / 30.44), ['місяць', 'місяці', 'місяців'])} тому`;
    }

    public sameDay(a: number, b: number): boolean {
        return new Date(a * 1000).toDateString() === new Date(b * 1000).toDateString();
    }

    /**
     * The history endpoint sends no comments; a month opened on the dashboard is
     * cached with them, so whatever the cache has is shown.
     */
    private cachedComment(row: CounterpartyRow, cache: Map<string, Map<string, string>>): string {
        const date = new Date(row.tx.time * 1000);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const slot = `${row.accountId}|${year}|${month}`;
        let byId = cache.get(slot);
        if (!byId) {
            byId = new Map();
            const rows = this.store.readMonth(row.accountId, year, month, true)
                ?? this.store.readMonth(row.accountId, year, month, false)
                ?? [];
            for (const tx of rows) if (tx?.comment) byId.set(tx.id, tx.comment);
            cache.set(slot, byId);
        }
        return byId.get(row.tx.id) ?? '';
    }
}
