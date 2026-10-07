import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { currencyCodesMap } from '@core/data';
import { AssignMode, explainCategory, merchantLabel, UNCATEGORIZED } from '@core/helpers/categorize';
import { OTHER_TITLE, OWN_MONEY_TITLE } from '@core/helpers/category-titles';
import { CategoryColorsService } from '@core/services/category-colors.service';

import { cardAccusative } from '@core/helpers/card-names';
import { flowOf, InternalKind, internalKind, isPendingHold } from '@core/helpers/flows';
import { IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { CategoryPickerComponent, ToastService } from '@shared/components';
import { Observable } from 'rxjs';
import { mccName } from '../../../../features/analytics-mcc/mcc-map';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';

type DetailRow = { label: string; value: string; mono?: boolean; copy?: boolean };

/** Ukrainian plural: 1 операція, 2–4 операції, 5+ операцій (11–14 take the last form). */
function plural(n: number, forms: readonly [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

@Component({
    selector: 'app-transaction-details',
    standalone: true,
    imports: [DatePipe, DisplayMoneyPipe, OverlayModule, CategoryPickerComponent],
    templateUrl: './transaction-details.component.html',
    styleUrl: './transaction-details.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TransactionDetailsComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly location = inject(Location);
    private readonly monobankService = inject(MonobankService);
    private readonly categories = inject(CategoryGroupService);
    private readonly toast = inject(ToastService);

    readonly transaction = signal<ITransaction | null>(null);
    readonly transactionId = signal('');

    readonly OTHER_TITLE = OTHER_TITLE;
    readonly OWN_MONEY_TITLE = OWN_MONEY_TITLE;

    readonly groups = toSignal(this.categories.categoryGroups$ as Observable<ICategoryGroup[]>, { initialValue: [] as ICategoryGroup[] });
    private readonly monthRows = toSignal(
        this.monobankService.currentTransactions$ as Observable<ITransaction[]>,
        { initialValue: [] as ITransaction[] },
    );

    // ── category ─────────────────────────────────────────────
    readonly categoryMode = toSignal(this.categories.mode$, { requireSync: true });
    private readonly flowContext = toSignal(this.categories.flowContext$, { requireSync: true });

    private readonly explained = computed(() => {
        const tx = this.transaction();
        return tx ? explainCategory(tx, this.groups()) : { index: UNCATEGORIZED, reason: { by: 'none' as const } };
    });
    readonly categoryIndex = computed(() => this.explained().index);

    private readonly accounts = toSignal(this.monobankService.clientInfo$ as Observable<IAccountInfo | null>, { initialValue: null });

    /** Own money changing pockets — and how the app can tell. */
    private readonly ownMove = computed(() => {
        const tx = this.transaction();
        return tx ? internalKind(tx, this.flowContext()) : null;
    });

    private ownMoveText(kind: InternalKind, tx: ITransaction): string {
        switch (kind) {
            case 'own-transfer': {
                const twin = typeof tx.ownTransfer === 'object' ? tx.ownTransfer : null;
                if (!twin) return 'переказ на вашу іншу картку';
                const card = this.accounts()?.accounts?.find(a => a.id === twin.cardId);
                const where = cardAccusative(card?.type, card?.currencyCode);
                const amount = this.original(twin.amount, card?.currencyCode ?? 980);
                return `переказ на ${where}: там у ту ж хвилину «${twin.description}» +${amount}`;
            }
            case 'own-card': return 'переказ між вашими картками';
            case 'own-jar': return 'ваша банка';
            case 'round-up': return 'округлення у вашу банку';
            case 'deposit': return 'ваш депозит';
            case 'installment-credit': return 'гроші розстрочки — не дохід';
            case 'cash-in': return 'внесення готівки через касу';
            case 'own-name': return 'ваш рахунок в іншому банку';
        }
    }

    /** Why it landed there — the automatic categories are read-only, so say how they decided. */
    readonly categoryReason = computed(() => {
        const tx = this.transaction();
        const kind = this.ownMove();
        if (tx && kind) return this.ownMoveText(kind, tx);
        const reason = this.explained().reason;
        switch (reason.by) {
            case 'pin': return 'перенесено вручну';
            case 'rule': {
                const note = this.category()?.ruleNotes?.[reason.key];
                return `ваше правило «${reason.key}»${note ? ` · ${note}` : ''}`;
            }
            case 'system': return 'за формулюванням виписки';
            case 'text': return `збіг із «${reason.key}»`;
            case 'mcc': return `за MCC ${reason.mcc}`;
            default: return 'жодне правило не підійшло';
        }
    });

    /** Fresh hold: still pending. Older: Monobank never cleared the flag, the money was taken. */
    readonly pending = computed(() => {
        const tx = this.transaction();
        return !!tx && isPendingHold(tx);
    });
    readonly staleHold = computed(() => !!this.transaction()?.hold && !this.pending());

    readonly flow = computed(() => {
        const tx = this.transaction();
        return tx ? flowOf(tx, this.flowContext()) : 'spend';
    });
    readonly category = computed(() => this.groups()[this.categoryIndex()] ?? null);
    private readonly colors = inject(CategoryColorsService);
    readonly categoryColor = computed(() => this.colors.colorFor(this.category()?.title));

    readonly merchant = computed(() => {
        const tx = this.transaction();
        return tx ? merchantLabel(tx) : '';
    });

    /** Same merchant this month — context for the amount and for "every X" in the picker. */
    readonly siblings = computed(() => {
        const label = this.merchant().toLocaleLowerCase();
        if (!label) return [];
        return this.monthRows().filter(tx => merchantLabel(tx).toLocaleLowerCase() === label);
    });
    readonly siblingsNet = computed(() => this.siblings().reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
    readonly siblingsCountLabel = computed(() => {
        const n = this.siblings().length;
        return `${n} ${plural(n, ['операція', 'операції', 'операцій'])}`;
    });

    // ── figures ──────────────────────────────────────────────
    readonly foreign = computed(() => {
        const tx = this.transaction();
        return !!tx && tx.currencyCode !== tx.cardCurrencyCode;
    });

    readonly mccLabel = computed(() => {
        const mcc = this.transaction()?.mcc;
        return mcc ? mccName(mcc) : '';
    });

    /** Only rows that carry information — a wall of "n/a" hides the ones that matter. */
    readonly details = computed<DetailRow[]>(() => {
        const tx = this.transaction();
        if (!tx) return [];
        const rows: DetailRow[] = [];
        const add = (label: string, value: unknown, extra: Partial<DetailRow> = {}) => {
            const text = value === null || value === undefined ? '' : String(value).trim();
            if (text) rows.push({ label, value: text, ...extra });
        };
        // mccName already reads "5411 · Grocery Stores & Supermarkets"
        if (tx.mcc) add('MCC', this.mccLabel() || tx.mcc);
        if (tx.originalMcc && tx.originalMcc !== tx.mcc) add('Оригінальний MCC', tx.originalMcc, { mono: true });
        add('Коментар', tx.comment);
        add('Торговець', tx.merchantName && tx.merchantName !== tx.description ? tx.merchantName : '');
        add('Контрагент', tx.counterName);
        add('ЄДРПОУ', tx.counterEdrpou, { mono: true, copy: true });
        add('IBAN', tx.counterIban, { mono: true, copy: true });
        add('Квитанція', tx.receiptId, { mono: true, copy: true });
        add('Інвойс', tx.invoiceId, { mono: true, copy: true });
        add('ID операції', tx.id, { mono: true, copy: true });
        return rows;
    });

    ngOnInit(): void {
        const transactionId = this.route.snapshot.paramMap.get('id') ?? '';
        this.transactionId.set(transactionId);

        const navigationState = history.state?.transaction as ITransaction | undefined;
        const resolved = navigationState ?? this.monobankService.resolveTransactionSnapshot(transactionId);
        if (resolved) {
            this.transaction.set(resolved);
            this.monobankService.rememberTransaction(resolved);
        }
    }

    /** Back to wherever the transaction was opened from — ledger, calendar or categories. */
    goBack(): void {
        if ((history.state?.navigationId ?? 1) > 1) this.location.back();
        else this.router.navigate(['/dashboard']);
    }

    currencyName(code: number): string {
        return currencyCodesMap[code]?.name ?? 'UAH';
    }

    /** An amount in its own currency, never re-converted: −222,27 $. */
    original(minor: number, code: number): string {
        const symbol = ({ 980: '₴', 840: '$', 978: '€', 985: 'zł' } as Record<number, string>)[code] ?? this.currencyName(code);
        const value = (Math.abs(minor) / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${minor < 0 ? '−' : ''}${value} ${symbol}`;
    }

    copy(row: DetailRow): void {
        navigator.clipboard?.writeText(row.value).then(
            () => this.toast.success(`Скопійовано: ${row.label}`),
            () => this.toast.error('Не вдалося скопіювати'),
        );
    }

    openMerchantSearch(): void {
        const tx = this.transaction();
        const merchant = (tx?.description ?? '').trim();
        if (merchant) this.router.navigate(['/trends/counterparty'], { queryParams: { q: merchant } });
    }

    // ── picker ───────────────────────────────────────────────
    readonly pickerOrigin = signal<HTMLElement | null>(null);
    readonly pickerPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    ];

    togglePicker(event: Event): void {
        if (this.categoryMode() === 'auto') return;
        const origin = event.currentTarget as HTMLElement;
        this.pickerOrigin.set(this.pickerOrigin() ? null : origin);
    }

    closePicker(): void {
        const origin = this.pickerOrigin();
        this.pickerOrigin.set(null);
        origin?.focus({ preventScroll: true });
    }

    onPick(choice: { index: number; mode: AssignMode }): void {
        const tx = this.transaction();
        if (!tx) return;
        const title = this.groups()[choice.index]?.title;
        if (!title) return;
        this.categories.assign(tx, title, choice.mode);
        this.toast.success(choice.mode === 'merchant' ? `Правило: «${this.merchant()}» → ${title}` : `Перенесено до «${title}»`);
        this.closePicker();
    }
}
