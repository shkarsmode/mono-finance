import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
    AssignMode, categoryColor, categoryIndexOf, matchingIndexes, merchantLabel, UNCATEGORIZED,
} from '@core/helpers/categorize';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService } from '@core/services/category-group.service';
import { MonobankService } from '@core/services/monobank.service';
import { CategoryPickerComponent, ToastService } from '@shared/components';
import { Observable } from 'rxjs';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';

const INBOX = '\u0000inbox';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Descriptions Monobank writes for money moving between your own pockets — jar
 * top-ups and withdrawals, round-ups, own-card transfers. Used only to SUGGEST a
 * "not counted" category; nothing is excluded until you say so.
 */
const OWN_MONEY = [
    /^Поповнення «/i, /^Часткове зняття банки/i, /^Виплата банки/i, /^Округлення балансу/i,
    /^Reserve$/i, /^З (Білої|Чорної|доларової|євро) картки/i, /^На (Білу|Чорну) картку/i, /^Зняття з банки/i,
];

type MerchantBucket = {
    label: string;
    count: number;
    net: number;
    last: number;
    sample: ITransaction;
    ownMoney: boolean;
};

type RuleView = { key: string; kind: 'Merchant' | 'MCC'; hits: number };

@Component({
    selector: 'app-categories',
    standalone: true,
    imports: [DatePipe, DisplayMoneyPipe, DragDropModule, OverlayModule, CategoryPickerComponent],
    templateUrl: './categories.component.html',
    styleUrl: './categories.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CategoriesComponent {
    private readonly categories = inject(CategoryGroupService);
    private readonly monobank = inject(MonobankService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);

    readonly INBOX = INBOX;
    readonly groups = toSignal(this.categories.categoryGroups$, { initialValue: [] as ICategoryGroup[] });
    readonly transactions = toSignal(
        this.monobank.currentTransactions$ as Observable<ITransaction[]>,
        { initialValue: [] as ITransaction[] },
    );

    readonly selected = signal<string>(INBOX);
    readonly periodLabel = `${MONTHS[this.monobank.activeMonth - 1] ?? ''} ${this.monobank.activeYear}`;
    readonly currency = computed(() => this.transactions()[0]?.cardCurrencyCode ?? 980);

    readonly color = categoryColor;

    plural(n: number, one: string, many: string): string {
        return `${n} ${n === 1 ? one : many}`;
    }

    // ── list ─────────────────────────────────────────────────

    readonly uncategorized = computed(() => {
        const groups = this.groups();
        return this.transactions().filter(tx => categoryIndexOf(tx, groups) === UNCATEGORIZED);
    });

    readonly uncategorizedNet = computed(() =>
        this.uncategorized().reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    );

    readonly selectedIndex = computed(() => this.groups().findIndex(g => g.title === this.selected()));
    readonly selectedGroup = computed(() => this.groups()[this.selectedIndex()] ?? null);

    select(title: string): void {
        this.selected.set(title);
        this.confirmDelete.set(false);
        this.ruleDraft.set('');
        // On a phone the editor sits under the list — jump to it, without animation.
        if (window.innerWidth < 960) {
            setTimeout(() => document.querySelector('app-categories .detail')?.scrollIntoView({ block: 'start' }), 0);
        }
    }

    onDrop(event: CdkDragDrop<ICategoryGroup[]>): void {
        this.categories.move(event.previousIndex, event.currentIndex);
    }

    // ── inbox ────────────────────────────────────────────────

    readonly inbox = computed<MerchantBucket[]>(() => {
        const buckets = new Map<string, MerchantBucket>();
        for (const tx of this.uncategorized()) {
            const label = merchantLabel(tx) || '—';
            const id = label.toLocaleLowerCase();
            let bucket = buckets.get(id);
            if (!bucket) {
                bucket = { label, count: 0, net: 0, last: 0, sample: tx, ownMoney: OWN_MONEY.some(re => re.test(label)) };
                buckets.set(id, bucket);
            }
            bucket.count += 1;
            bucket.net += Number(tx.amount) || 0;
            if (tx.time > bucket.last) {
                bucket.last = tx.time;
                bucket.sample = tx;
            }
        }
        return Array.from(buckets.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    });

    readonly ownMoneyBuckets = computed(() => this.inbox().filter(bucket => bucket.ownMoney));
    readonly ownMoneyPreview = computed(() => {
        const labels = this.ownMoneyBuckets().map(bucket => bucket.label);
        return labels.slice(0, 4).join(' · ') + (labels.length > 4 ? ' …' : '');
    });

    /**
     * Where "own money" goes: the first not-counted category, else one already called
     * "Transfers", else a new one.
     */
    readonly transfersTarget = computed(() => {
        const groups = this.groups();
        const excluded = groups.findIndex(g => g.excluded);
        if (excluded >= 0) return { index: excluded, title: groups[excluded].title };
        const named = groups.findIndex(g => g.title.trim().toLocaleLowerCase() === 'transfers');
        if (named >= 0) return { index: named, title: groups[named].title };
        return { index: -1, title: 'Transfers' };
    });

    /** One click: every own-money merchant into a category that is not counted. */
    createTransfers(): void {
        const keys = this.ownMoneyBuckets().map(bucket => bucket.label);
        if (!keys.length) return;
        const target = this.transfersTarget();

        let groups = [...this.categories.definitions];
        let index = target.index;
        if (index < 0) {
            groups.push({ emoji: '🔁', title: target.title, keys: [], excluded: true, amount: 0 });
            index = groups.length - 1;
        }

        // the target owns these keys from now on — drop identical ones elsewhere
        const lower = new Set(keys.map(k => k.toLocaleLowerCase()));
        groups = groups.map((group, i) => {
            const kept = (group.keys ?? []).filter(k => !lower.has(String(k).trim().toLocaleLowerCase()));
            return i === index ? { ...group, excluded: true, keys: [...kept, ...keys] } : { ...group, keys: kept };
        });

        this.categories.replaceAll(groups);
        this.toast.success(`${target.title}: ${keys.length} more merchants, left out of Spent and Income`);
    }

    // ── picker (inbox rows) ──────────────────────────────────

    readonly picker = signal<{ bucket: MerchantBucket; origin: HTMLElement } | null>(null);
    readonly pickerPositions: ConnectedPosition[] = [
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
    ];

    openPicker(event: Event, bucket: MerchantBucket): void {
        event.stopPropagation();
        const origin = event.currentTarget as HTMLElement;
        this.picker.set(this.picker()?.bucket.label === bucket.label ? null : { bucket, origin });
    }

    closePicker(): void {
        const open = this.picker();
        this.picker.set(null);
        open?.origin.focus({ preventScroll: true });
    }

    onPick(choice: { index: number; mode: AssignMode }): void {
        const open = this.picker();
        if (!open) return;
        this.categories.assign(open.bucket.sample, choice.index, choice.mode);
        this.toast.success(`“${open.bucket.label}” → ${this.groups()[choice.index]?.title ?? ''}`);
        this.closePicker();
    }

    onCreate(choice: { title: string; mode: AssignMode }): void {
        const open = this.picker();
        if (!open) return;
        this.categories.createAndAssign(open.bucket.sample, { title: choice.title }, choice.mode);
        this.toast.success(`“${open.bucket.label}” → ${choice.title}`);
        this.closePicker();
    }

    // ── editor ───────────────────────────────────────────────

    readonly confirmDelete = signal(false);
    readonly ruleDraft = signal('');

    /** What this category wins, and what its rules match but lose to another category. */
    readonly preview = computed(() => {
        const index = this.selectedIndex();
        const groups = this.groups();
        if (index < 0) return { won: [] as ITransaction[], lost: [] as Array<{ tx: ITransaction; to: string; color: string }> };

        const won: ITransaction[] = [];
        const lost: Array<{ tx: ITransaction; to: string; color: string }> = [];
        for (const tx of this.transactions()) {
            const winner = categoryIndexOf(tx, groups);
            if (winner === index) won.push(tx);
            else if (matchingIndexes(tx, groups).includes(index)) {
                lost.push({ tx, to: groups[winner]?.title ?? '—', color: categoryColor(winner) });
            }
        }
        won.sort((a, b) => b.time - a.time);
        return { won, lost };
    });

    readonly rules = computed<RuleView[]>(() => {
        const group = this.selectedGroup();
        if (!group) return [];
        const txs = this.transactions();
        return (group.keys ?? []).map(key => {
            const k = String(key).trim();
            const isMcc = /^\d+$/.test(k);
            const needle = k.toLocaleLowerCase();
            const hits = txs.filter(tx => isMcc
                ? tx.mcc === Number(k) || tx.originalMcc === Number(k)
                : [tx.description, tx.merchantName, tx.counterName].some(f => (f ?? '').toLocaleLowerCase().includes(needle)),
            ).length;
            return { key, kind: isMcc ? 'MCC' : 'Merchant', hits };
        });
    });

    readonly pinned = computed(() => {
        const group = this.selectedGroup();
        if (!group?.txIds?.length) return [];
        const byId = new Map(this.transactions().map(tx => [tx.id, tx]));
        return group.txIds.map(id => ({ id, tx: byId.get(id) ?? null }));
    });

    /** Suggestions for the rule box: this month's merchants, uncategorized first. */
    readonly suggestions = computed(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        const push = (label: string) => {
            const id = label.toLocaleLowerCase();
            if (label && !seen.has(id)) { seen.add(id); out.push(label); }
        };
        this.inbox().forEach(bucket => push(bucket.label));
        this.transactions().forEach(tx => push(merchantLabel(tx)));
        return out.slice(0, 200);
    });

    rename(event: Event): void {
        const input = event.target as HTMLInputElement;
        const group = this.selectedGroup();
        const title = input.value.trim();
        if (!group || title === group.title) return;
        if (!title) { input.value = group.title; return; }
        if (this.categories.isTitleTaken(title, group.title)) {
            this.toast.error(`“${title}” already exists`);
            input.value = group.title;
            return;
        }
        this.categories.upsert(group.title, { ...group, title });
        this.selected.set(title);
    }

    setEmoji(event: Event): void {
        const group = this.selectedGroup();
        const emoji = (event.target as HTMLInputElement).value.trim();
        if (!group || emoji === (group.emoji ?? '')) return;
        this.categories.upsert(group.title, { ...group, emoji });
    }

    toggleCounted(): void {
        const group = this.selectedGroup();
        if (!group) return;
        this.categories.upsert(group.title, { ...group, excluded: !group.excluded });
    }

    onRuleInput(event: Event): void {
        this.ruleDraft.set((event.target as HTMLInputElement).value);
    }

    addRule(event?: Event): void {
        event?.preventDefault();
        const key = this.ruleDraft().trim();
        const index = this.selectedIndex();
        if (!key || index < 0) return;
        this.categories.addKey(index, key);
        this.ruleDraft.set('');
    }

    removeRule(key: string): void {
        const index = this.selectedIndex();
        if (index >= 0) this.categories.removeKey(index, key);
    }

    unpin(id: string): void {
        const index = this.selectedIndex();
        if (index >= 0) this.categories.unpin(index, id);
    }

    remove(): void {
        const group = this.selectedGroup();
        if (!group) return;
        if (!this.confirmDelete()) {
            this.confirmDelete.set(true);
            setTimeout(() => this.confirmDelete.set(false), 4000);
            return;
        }
        this.categories.delete(group);
        this.toast.success(`Deleted “${group.title}”`);
        this.select(INBOX);
    }

    createCategory(): void {
        const title = this.uniqueTitle('New category');
        this.categories.upsert(null, { emoji: '', title, keys: [], amount: 0 });
        this.select(title);
        // let the editor render, then put the cursor in the name
        setTimeout(() => (document.getElementById('category-name') as HTMLInputElement | null)?.select(), 0);
    }

    openTransaction(tx: ITransaction): void {
        this.monobank.rememberTransaction(tx);
        this.router.navigate(['/transactions', tx.id], { state: { transaction: tx } });
    }

    private uniqueTitle(base: string): string {
        let title = base;
        let n = 2;
        while (this.categories.isTitleTaken(title)) title = `${base} ${n++}`;
        return title;
    }
}
