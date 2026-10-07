import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
    ChangeDetectionStrategy, Component, computed, ElementRef, EventEmitter, HostListener, inject, Input, Output,
    signal, ViewChild,
} from '@angular/core';
import {
    AssignMode, explainCategory, MatchReason, merchantLabel, UNCATEGORIZED,
} from '@core/helpers/categorize';
import {
    BETWEEN_ACCOUNTS_TITLE, OTHER_TITLE, OWN_MONEY_TITLE, UNCATEGORIZED_TITLE,
} from '@core/helpers/category-titles';
import { Flow, flowOf, isPendingHold, isRoundUp, roundUpJar } from '@core/helpers/flows';
import { toSignal } from '@angular/core/rxjs-interop';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryColorsService } from '@core/services/category-colors.service';
import { CategoryGroupService } from '@core/services/category-group.service';
import { CategoryPickerComponent, ToastService } from '@shared/components';
import { DisplayMoneyPipe } from '../../../../../../shared/pipes/display-money.pipe';

export type LedgerSortKey = 'date' | 'merchant' | 'category' | 'amount' | 'balance';
type SortDir = 'asc' | 'desc';

/** Sentinel for "show only uncategorized" in the category filter. */
export const UNCATEGORIZED_FILTER = '\u0000uncategorized';
/** Sentinel for "show only money that moved between your own accounts". */
export const INTERNAL_FILTER = '\u0000internal';

type LedgerRow = {
    tx: ITransaction;
    index: number;
    category: string | null;
    color: string;
    /** Why this category — shown on hover in the automatic mode. */
    reason: string;
    flow: Flow;
    /** Only a FRESH hold is shown as pending — see isPendingHold. */
    pending: boolean;
};

type LedgerSection = {
    key: string;
    title: string;
    subtitle?: string;
    color?: string;
    net: number;
    count: number;
    rows: LedgerRow[];
};

const SORT_STORAGE = 'finance-ledger-sort';
const DENSITY_STORAGE = 'finance-ledger-density';

/**
 * First click direction per column — chosen for what you usually want to see first:
 * newest, A→Z, the biggest spending, the highest balance.
 */
const DEFAULT_DIR: Record<LedgerSortKey, SortDir> = {
    date: 'desc',
    merchant: 'asc',
    category: 'asc',
    amount: 'asc',
    balance: 'desc',
};

const SORT_LABEL: Record<LedgerSortKey, string> = {
    date: 'Дата',
    merchant: 'Опис',
    category: 'Категорія',
    amount: 'Сума',
    balance: 'Баланс',
};

/** Short weekday for the day rules, indexed by Date.getDay() (0 = Sunday). */
const WEEKDAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Ukrainian plural: 1 переказ, 2–4 перекази, 5+ переказів (11–14 take the last form). */
function plural(n: number, forms: readonly [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

function readSort(): { key: LedgerSortKey; dir: SortDir } {
    try {
        const raw = JSON.parse(localStorage.getItem(SORT_STORAGE) ?? 'null');
        if (raw && raw.key in DEFAULT_DIR && (raw.dir === 'asc' || raw.dir === 'desc')) return raw;
    } catch { /* fall through */ }
    return { key: 'date', dir: 'desc' };
}

function readCompact(): boolean {
    try { return localStorage.getItem(DENSITY_STORAGE) === 'compact'; } catch { return false; }
}

@Component({
    selector: 'app-transactions',
    standalone: true,
    imports: [DatePipe, NgTemplateOutlet, DisplayMoneyPipe, OverlayModule, CategoryPickerComponent],
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {
    private readonly categories = inject(CategoryGroupService);
    private readonly colors = inject(CategoryColorsService);
    private readonly toast = inject(ToastService);

    /** 'auto' categories are read-only here; 'mine' can be changed from the row. */
    public readonly categoryMode = toSignal(this.categories.mode$, { requireSync: true });
    public readonly countMode = toSignal(this.categories.countMode$, { requireSync: true });
    private readonly flowContext = toSignal(this.categories.flowContext$, { requireSync: true });

    @Input() public searchValue = '';
    @Input() public set groups(value: ICategoryGroup[] | null) {
        this.groupList.set(value ?? []);
    }
    @Input() public set transactions(value: ITransaction[] | null) {
        this.txList.set(value ?? []);
    }
    /** A category title, UNCATEGORIZED_FILTER, or null for everything. */
    @Input() public set categoryFilter(value: string | null) {
        this.filter.set(value);
    }

    @Output() public readonly searchTransactions = new EventEmitter<string>();
    @Output() public readonly openTransaction = new EventEmitter<ITransaction>();
    @Output() public readonly clearCategoryFilter = new EventEmitter<void>();

    @ViewChild('inputRef') public inputRef?: ElementRef<HTMLInputElement>;

    private readonly txList = signal<ITransaction[]>([]);
    private readonly groupList = signal<ICategoryGroup[]>([]);
    public readonly filter = signal<string | null>(null);

    public readonly isNarrow = signal(window.innerWidth < 900);
    public readonly compact = signal(readCompact());
    public readonly sort = signal(readSort());

    public readonly sortOptions = Object.keys(SORT_LABEL) as LedgerSortKey[];
    public readonly columns: LedgerSortKey[] = ['date', 'merchant', 'category', 'amount', 'balance'];
    /** Read side of the categories input, for the picker. */
    public readonly groupsView = this.groupList.asReadonly();
    public readonly sortLabel = SORT_LABEL;
    public readonly UNCATEGORIZED_FILTER = UNCATEGORIZED_FILTER;
    public readonly OTHER_TITLE = OTHER_TITLE;
    public readonly OWN_MONEY_TITLE = OWN_MONEY_TITLE;

    @HostListener('window:resize')
    public onResize(): void {
        this.isNarrow.set(window.innerWidth < 900);
    }

    /** "/" jumps to search from anywhere on the page, like most data tools. */
    @HostListener('document:keydown', ['$event'])
    public onDocumentKeydown(event: KeyboardEvent): void {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        event.preventDefault();
        this.inputRef?.nativeElement.focus();
    }

    // ── rows ─────────────────────────────────────────────────

    private readonly rows = computed<LedgerRow[]>(() => {
        const groups = this.groupList();
        const ctx = this.flowContext();
        return this.txList().map(tx => {
            const { index, reason } = explainCategory(tx, groups);
            return {
                tx,
                index,
                category: index === UNCATEGORIZED ? null : groups[index]?.title ?? null,
                color: this.colors.colorFor(index === UNCATEGORIZED ? null : groups[index]?.title),
                reason: describe(reason),
                flow: flowOf(tx, ctx),
                pending: isPendingHold(tx),
            };
        });
    });

    /** A day picked from the day rule, as "YYYY-M-D"; null for the whole month. */
    public readonly dayFilter = signal<string | null>(null);
    public readonly dayFilterLabel = signal('');

    private readonly visibleRows = computed<LedgerRow[]>(() => {
        const filter = this.filter();
        const day = this.dayFilter();
        let rows = this.rows();
        if (day !== null) rows = rows.filter(row => dayKey(row.tx.time) === day);
        if (filter === null) return rows;
        if (filter === UNCATEGORIZED_FILTER) return rows.filter(row => row.index === UNCATEGORIZED);
        if (filter === INTERNAL_FILTER) return rows.filter(row => row.flow === 'internal');
        return rows.filter(row => row.category === filter);
    });

    public toggleDay(section: { key: string; title: string; subtitle?: string }): void {
        if (this.sort().key !== 'date') return;
        if (this.dayFilter() === section.key) {
            this.dayFilter.set(null);
        } else {
            this.dayFilter.set(section.key);
            this.dayFilterLabel.set(`${section.title}, ${section.subtitle ?? ''}`.trim());
        }
    }

    public clearDay(): void {
        this.dayFilter.set(null);
    }

    public readonly count = computed(() => this.visibleRows().length);
    public readonly visibleNet = computed(() =>
        this.visibleRows().reduce((sum, row) => sum + (Number(row.tx.amount) || 0), 0),
    );
    public readonly currencyCode = computed(() => this.txList()[0]?.cardCurrencyCode ?? 980);

    public readonly filterLabel = computed(() => {
        const filter = this.filter();
        if (filter === null) return null;
        if (filter === INTERNAL_FILTER) return BETWEEN_ACCOUNTS_TITLE;
        if (filter === UNCATEGORIZED_FILTER) return this.categoryMode() === 'auto' ? OTHER_TITLE : UNCATEGORIZED_TITLE;
        return filter;
    });

    public readonly filterColor = computed(() => {
        const filter = this.filter();
        if (filter === null || filter === UNCATEGORIZED_FILTER) return this.colors.colorFor(null);
        if (filter === INTERNAL_FILTER) return 'var(--line-2)';
        return this.colors.colorFor(filter);
    });

    /** Grouped modes get sticky section rules; amount and balance are one flat sorted list. */
    public readonly grouped = computed(() => {
        const key = this.sort().key;
        return key === 'date' || key === 'category' || key === 'merchant';
    });

    /**
     * Monobank's automatic round-ups (dozens of 3–7 ₴ debits into a jar) fold into a
     * single line for the whole view. Not while searching — then they are wanted —
     * and not when they are all there is to show.
     */
    public readonly roundUps = computed(() => {
        const rows = this.visibleRows();
        if (this.searchValue?.trim()) return null;
        const folded = rows.filter(row => isRoundUp(row.tx));
        if (folded.length < 2 || folded.length === rows.length) return null;
        const count = folded.length;
        return {
            count,
            countLabel: `${count} ${plural(count, ['дрібний переказ', 'дрібні перекази', 'дрібних переказів'])} на банку`,
            net: folded.reduce((sum, row) => sum + (Number(row.tx.amount) || 0), 0),
            jar: roundUpJar(folded[0].tx),
            rows: [...folded].sort((a, b) => b.tx.time - a.tx.time),
        };
    });

    public readonly roundUpsOpen = signal(false);

    private readonly listedRows = computed(() =>
        this.roundUps() ? this.visibleRows().filter(row => !isRoundUp(row.tx)) : this.visibleRows(),
    );

    public readonly sections = computed<LedgerSection[]>(() => {
        const { key, dir } = this.sort();
        const rows = this.listedRows();
        const sign = dir === 'asc' ? 1 : -1;
        const byTimeDesc = (a: LedgerRow, b: LedgerRow) => b.tx.time - a.tx.time;
        const collator = new Intl.Collator('uk-UA', { sensitivity: 'base', numeric: true });
        const uncategorizedTitle = this.categoryMode() === 'auto' ? OTHER_TITLE : UNCATEGORIZED_TITLE;

        if (key === 'amount' || key === 'balance') {
            const sorted = [...rows].sort((a, b) =>
                sign * ((Number(a.tx[key]) || 0) - (Number(b.tx[key]) || 0)) || byTimeDesc(a, b),
            );
            return [{ key: 'all', title: '', net: 0, count: sorted.length, rows: sorted }];
        }

        const buckets = new Map<string, LedgerSection>();
        for (const row of rows) {
            let id: string;
            let title: string;
            let subtitle: string | undefined;
            let color: string | undefined;

            if (key === 'date') {
                const d = new Date(row.tx.time * 1000);
                id = dayKey(row.tx.time);
                title = WEEKDAY_SHORT[d.getDay()];
                subtitle = d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
            } else if (key === 'category') {
                id = row.category ?? UNCATEGORIZED_FILTER;
                title = row.category ?? uncategorizedTitle;
                color = row.color;
            } else {
                const label = merchantLabel(row.tx) || '—';
                id = label.toLocaleLowerCase();
                title = label;
            }

            let section = buckets.get(id);
            if (!section) {
                section = { key: id, title, subtitle, color, net: 0, count: 0, rows: [] };
                buckets.set(id, section);
            }
            section.rows.push(row);
            section.count += 1;
            section.net += Number(row.tx.amount) || 0;
        }

        const sections = Array.from(buckets.values());

        if (key === 'date') {
            for (const section of sections) section.rows.sort((a, b) => sign * (a.tx.time - b.tx.time));
            return sections.sort((a, b) => sign * (a.rows[0].tx.time - b.rows[0].tx.time));
        }

        for (const section of sections) section.rows.sort(byTimeDesc);
        return sections.sort((a, b) => {
            // Uncategorized always last — it is a to-do list, not a category.
            if (a.key === UNCATEGORIZED_FILTER) return 1;
            if (b.key === UNCATEGORIZED_FILTER) return -1;
            return sign * collator.compare(a.title, b.title);
        });
    });

    // ── sorting ──────────────────────────────────────────────

    public sortBy(key: LedgerSortKey): void {
        const current = this.sort();
        const next = current.key === key
            ? { key, dir: (current.dir === 'asc' ? 'desc' : 'asc') as SortDir }
            : { key, dir: DEFAULT_DIR[key] };
        this.sort.set(next);
        try { localStorage.setItem(SORT_STORAGE, JSON.stringify(next)); } catch { /* private mode */ }
    }

    public onSortSelect(event: Event): void {
        this.sortBy((event.target as HTMLSelectElement).value as LedgerSortKey);
    }

    public resetSort(): void {
        this.sort.set({ key: 'date', dir: 'desc' });
        try { localStorage.removeItem(SORT_STORAGE); } catch { /* ignore */ }
    }

    public ariaSort(key: LedgerSortKey): 'ascending' | 'descending' | 'none' {
        const { key: active, dir } = this.sort();
        if (active !== key) return 'none';
        return dir === 'asc' ? 'ascending' : 'descending';
    }

    public setCompact(value: boolean): void {
        this.compact.set(value);
        try { localStorage.setItem(DENSITY_STORAGE, value ? 'compact' : 'comfortable'); } catch { /* ignore */ }
    }

    // ── search ───────────────────────────────────────────────

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    public clearInputEvent(): void {
        if (this.inputRef) this.inputRef.nativeElement.value = '';
        this.searchTransactions.emit('');
    }

    // ── open ─────────────────────────────────────────────────

    public onTransactionClick(transaction: ITransaction): void {
        this.openTransaction.emit(transaction);
    }

    public onRowKeydown(event: KeyboardEvent, transaction: ITransaction): void {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.openTransaction.emit(transaction);
        }
    }

    // ── categorize inline ────────────────────────────────────

    public readonly picker = signal<{ row: LedgerRow; origin: HTMLElement } | null>(null);

    public readonly pickerPositions: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    ];

    public readonly pickerMerchant = computed(() => {
        const open = this.picker();
        return open ? merchantLabel(open.row.tx) : '';
    });

    public readonly pickerMerchantCount = computed(() => {
        const open = this.picker();
        if (!open) return 0;
        const label = merchantLabel(open.row.tx).toLocaleLowerCase();
        if (!label) return 0;
        return this.txList().filter(tx => merchantLabel(tx).toLocaleLowerCase() === label).length;
    });

    public openPicker(event: Event, row: LedgerRow): void {
        event.stopPropagation();
        if (this.categoryMode() === 'auto') return;
        const origin = event.currentTarget as HTMLElement;
        this.picker.set(this.picker()?.row.tx.id === row.tx.id ? null : { row, origin });
    }

    public closePicker(): void {
        const open = this.picker();
        this.picker.set(null);
        open?.origin.focus({ preventScroll: true });
    }

    public onPick(choice: { index: number; mode: AssignMode }): void {
        const open = this.picker();
        if (!open) return;
        const title = this.groupList()[choice.index]?.title ?? '';
        if (!title) return;
        this.categories.assign(open.row.tx, title, choice.mode);
        this.announce(open.row.tx, title, choice.mode);
        this.closePicker();
    }

    private announce(tx: ITransaction, title: string, mode: AssignMode): void {
        const merchant = merchantLabel(tx);
        this.toast.success(mode === 'merchant' && merchant
            ? `Усі операції «${merchant}» → ${title}`
            : `Перенесено до «${title}»`);
    }
}

function dayKey(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function describe(reason: MatchReason): string {
    switch (reason.by) {
        case 'pin': return 'Закріплено за цією категорією';
        case 'system': return 'Розпізнано автоматично';
        case 'text': return `Збіг із «${reason.key}»`;
        case 'mcc': return `За MCC ${reason.mcc}`;
        default: return 'Жодне правило не підійшло';
    }
}
