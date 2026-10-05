import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { currencyCodesMap } from '@core/data';
import { AssignMode, categoryColor, categoryIndexOf, merchantLabel, UNCATEGORIZED } from '@core/helpers/categorize';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { CategoryPickerComponent, ToastService } from '@shared/components';
import { Observable } from 'rxjs';
import { mccName } from '../../../../features/analytics-mcc/mcc-map';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';

type DetailRow = { label: string; value: string; mono?: boolean; copy?: boolean };

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

    readonly groups = toSignal(this.categories.categoryGroups$ as Observable<ICategoryGroup[]>, { initialValue: [] as ICategoryGroup[] });
    private readonly monthRows = toSignal(
        this.monobankService.currentTransactions$ as Observable<ITransaction[]>,
        { initialValue: [] as ITransaction[] },
    );

    // ── category ─────────────────────────────────────────────
    readonly categoryIndex = computed(() => {
        const tx = this.transaction();
        return tx ? categoryIndexOf(tx, this.groups()) : UNCATEGORIZED;
    });
    readonly category = computed(() => this.groups()[this.categoryIndex()] ?? null);
    readonly categoryColor = computed(() => categoryColor(this.categoryIndex()));

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
        if (tx.originalMcc && tx.originalMcc !== tx.mcc) add('Original MCC', tx.originalMcc, { mono: true });
        add('Comment', tx.comment);
        add('Merchant', tx.merchantName && tx.merchantName !== tx.description ? tx.merchantName : '');
        add('Counterparty', tx.counterName);
        add('EDRPOU', tx.counterEdrpou, { mono: true, copy: true });
        add('IBAN', tx.counterIban, { mono: true, copy: true });
        add('Receipt', tx.receiptId, { mono: true, copy: true });
        add('Invoice', tx.invoiceId, { mono: true, copy: true });
        add('Transaction ID', tx.id, { mono: true, copy: true });
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

    copy(row: DetailRow): void {
        navigator.clipboard?.writeText(row.value).then(
            () => this.toast.success(`${row.label} copied`),
            () => this.toast.error('Could not copy'),
        );
    }

    openMerchantSearch(): void {
        const tx = this.transaction();
        const merchant = tx?.merchantKey || tx?.merchantName || tx?.description;
        if (merchant) this.router.navigate(['/analytics/mcc'], { queryParams: { search: merchant } });
    }

    // ── picker ───────────────────────────────────────────────
    readonly pickerOrigin = signal<HTMLElement | null>(null);
    readonly pickerPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    ];

    togglePicker(event: Event): void {
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
        this.categories.assign(tx, choice.index, choice.mode);
        this.toast.success(`Moved to ${this.groups()[choice.index]?.title ?? ''}`);
        this.closePicker();
    }

    onCreate(choice: { title: string; mode: AssignMode }): void {
        const tx = this.transaction();
        if (!tx) return;
        this.categories.createAndAssign(tx, { title: choice.title }, choice.mode);
        this.toast.success(`Moved to ${choice.title}`);
        this.closePicker();
    }
}
