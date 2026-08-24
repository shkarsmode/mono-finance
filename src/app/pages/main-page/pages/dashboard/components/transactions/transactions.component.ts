import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, EventEmitter, HostListener, Input, Output, signal, ViewChild } from '@angular/core';
import { TransactionSortBy } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { DisplayMoneyPipe } from '../../../../../../shared/pipes/display-money.pipe';

/** A transaction with its resolved category identity. */
type LedgerRow = {
    tx: ITransaction;
    categoryName: string | null;
    categoryVar: string;
};

/** One day of the ledger: a sticky rule with a running total. */
type LedgerDay = {
    key: string;
    weekday: string;
    date: string;
    net: number;
    count: number;
    rows: LedgerRow[];
};

@Component({
    selector: 'app-transactions',
    standalone: true,
    imports: [DatePipe, DisplayMoneyPipe],
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {
    @Input() public title = 'Ledger';
    @Input() public allowGroupFilter = true;
    @Input() public searchValue: string = '';
    @Input() public sortByValue!: TransactionSortBy;

    @Input() public set groups(value: ICategoryGroup[] | null) {
        this.groupList.set(value ?? []);
    }
    @Input() public set transactions(value: ITransaction[] | null) {
        this.txList.set(value ?? []);
    }

    @Output() public sortBy = new EventEmitter<{ sortBy: TransactionSortBy; direction: 'asc' | 'desc' }>();
    @Output() public searchTransactions = new EventEmitter<string>();
    @Output() public selectValueChange = new EventEmitter<string[]>();
    @Output() public selectMonth = new EventEmitter<number>();
    @Output() public selectYear = new EventEmitter<number>();
    @Output() public openTransaction = new EventEmitter<ITransaction>();

    @ViewChild('inputRef') public inputRef!: ElementRef<HTMLInputElement>;

    private readonly txList = signal<ITransaction[]>([]);
    private readonly groupList = signal<ICategoryGroup[]>([]);

    public readonly isNarrow = signal(window.innerWidth < 900);
    public readonly compact = signal(false);
    public isAscSortDirection = false;
    public readonly SortBy = TransactionSortBy;

    /** Live — the old code sampled width once at construction and never updated. */
    @HostListener('window:resize')
    public onResize(): void {
        this.isNarrow.set(window.innerWidth < 900);
    }

    public readonly count = computed(() => this.txList().length);

    /**
     * The ledger, grouped into days. Each day carries its own net and count so
     * the sticky rule can show a running total while you scan.
     */
    public readonly days = computed<LedgerDay[]>(() => {
        const rows = this.txList().map(tx => this.resolveCategory(tx));
        const byDay = new Map<string, LedgerDay>();

        for (const row of rows) {
            const date = new Date(row.tx.time * 1000);
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            let day = byDay.get(key);
            if (!day) {
                day = {
                    key,
                    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
                    date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                    net: 0,
                    count: 0,
                    rows: [],
                };
                byDay.set(key, day);
            }
            day.rows.push(row);
            day.net += Number(row.tx.amount) || 0;
            day.count += 1;
        }

        return Array.from(byDay.values());
    });

    /**
     * Resolve a transaction to exactly one category, first match wins, and take
     * its colour from the category's index so identity is stable.
     */
    private resolveCategory(tx: ITransaction): LedgerRow {
        const groups = this.groupList();
        const description = (tx.description ?? '').toLocaleLowerCase();
        const merchant = ((tx as any).merchantName ?? '').toLocaleLowerCase();
        const counter = (tx.counterName ?? '').toLocaleLowerCase();

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const hit = (group.keys ?? []).some((rawKey: string) => {
                const key = (rawKey ?? '').trim();
                if (!key) return false;
                if (/^\d+$/.test(key)) {
                    const mcc = Number(key);
                    return tx.mcc === mcc || tx.originalMcc === mcc;
                }
                const needle = key.toLocaleLowerCase();
                return description.includes(needle) || merchant.includes(needle) || counter.includes(needle);
            });
            if (hit) {
                return {
                    tx,
                    categoryName: group.title,
                    categoryVar: `var(--cat-${(i % 12) + 1})`,
                };
            }
        }

        return { tx, categoryName: null, categoryVar: 'var(--cat-12)' };
    }

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    public clearInputEvent(): void {
        if (this.inputRef) {
            this.inputRef.nativeElement.value = '';
        }
        this.searchTransactions.emit('');
    }

    public onSortByEvent(sortBy: TransactionSortBy): void {
        if (sortBy === this.sortByValue) this.isAscSortDirection = !this.isAscSortDirection;
        this.sortBy.emit({ sortBy, direction: this.isAscSortDirection ? 'asc' : 'desc' });
    }

    public toggleDensity(): void {
        this.compact.update(v => !v);
    }

    public onTransactionClick(transaction: ITransaction): void {
        this.openTransaction.emit(transaction);
    }

    /** Keyboard access for a row — the list was click-only before. */
    public onRowKeydown(event: KeyboardEvent, transaction: ITransaction): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.openTransaction.emit(transaction);
        }
    }
}
