import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
    AssignMode, categoryIndexOf, isMccKey, matchingIndexes, UNCATEGORIZED,
} from '@core/helpers/categorize';
import { OTHER_TITLE, OWN_MONEY_TITLES } from '@core/helpers/category-titles';
import { partyLabel } from '@core/helpers/flows';
import { ICategoryGroup, IPersonalRules, ITransaction } from '@core/interfaces';
import { CategoryColorsService } from '@core/services/category-colors.service';
import { CategoryGroupService, CategoryMode } from '@core/services/category-group.service';
import { MonobankService } from '@core/services/monobank.service';
import { CategoryPickerComponent, ToastService } from '@shared/components';
import { Observable } from 'rxjs';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';

const INBOX = '\u0000inbox';
const RULES = '\u0000rules';

/** Lower case: the period sits inside a sentence, «Дані за лютий 2026». */
const MONTHS = [
    'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
    'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

type MerchantBucket = { label: string; count: number; net: number; last: number; sample: ITransaction };
type BuiltinRule = { key: string; kind: 'MCC' | 'Starts' | 'Merchant'; hits: number };
type MyRule = { category: string; emoji: string; key: string; note: string; hits: number };

/** Does this text rule match the transaction — the same test the engine runs. */
function textMatches(rule: string, tx: ITransaction): boolean {
    const starts = rule.startsWith('^');
    const needle = (starts ? rule.slice(1) : rule).toLocaleLowerCase();
    if (starts) return (tx.description ?? '').toLocaleLowerCase().startsWith(needle);
    return [tx.description, tx.merchantName, tx.counterName].some(field => (field ?? '').toLocaleLowerCase().includes(needle));
}

@Component({
    selector: 'app-categories',
    standalone: true,
    imports: [DatePipe, DisplayMoneyPipe, OverlayModule, CategoryPickerComponent],
    templateUrl: './categories.component.html',
    styleUrl: './categories.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CategoriesComponent {
    private readonly categories = inject(CategoryGroupService);
    private readonly monobank = inject(MonobankService);
    private readonly toast = inject(ToastService);
    private readonly router = inject(Router);
    private readonly colors = inject(CategoryColorsService);

    readonly INBOX = INBOX;
    readonly RULES = RULES;
    readonly OTHER_TITLE = OTHER_TITLE;

    readonly mode = toSignal(this.categories.mode$, { requireSync: true });
    /** Your rules apply: «Авто + мої правила». */
    readonly plus = computed(() => this.mode() === 'plus');
    readonly personal = toSignal(this.categories.rules$, { initialValue: [] as IPersonalRules[] });

    readonly groups = toSignal(this.categories.categoryGroups$, { initialValue: [] as ICategoryGroup[] });
    readonly transactions = toSignal(
        this.monobank.currentTransactions$ as Observable<ITransaction[]>,
        { initialValue: [] as ITransaction[] },
    );

    readonly selected = signal<string>(RULES);
    readonly periodLabel = `${MONTHS[this.monobank.activeMonth - 1] ?? ''} ${this.monobank.activeYear}`;
    readonly currency = computed(() => this.transactions()[0]?.cardCurrencyCode ?? 980);
    readonly color = (title: string | null | undefined) => this.colors.colorFor(title);

    setMode(mode: CategoryMode): void {
        this.categories.setMode(mode);
    }

    /** «1 правило», «3 правила», «5 правил»: `forms` are the words for 1, for 2–4 and for 5+. */
    plural(n: number, forms: readonly string[]): string {
        const mod10 = n % 10;
        const mod100 = n % 100;
        const form = mod10 === 1 && mod100 !== 11 ? forms[0]
            : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1]
            : forms[2];
        return `${n} ${form}`;
    }

    isOwnMoney(title: string): boolean {
        return OWN_MONEY_TITLES.includes(title);
    }

    select(id: string): void {
        this.selected.set(id);
        this.ruleDraft.set('');
        this.noteDraft.set('');
        // On a phone the panel sits under the list — jump to it, without animation.
        if (window.innerWidth < 960) {
            setTimeout(() => document.querySelector('app-categories .detail')?.scrollIntoView({ block: 'start' }), 0);
        }
    }

    // ── «Інше» ───────────────────────────────────────────────

    readonly uncategorized = computed(() => {
        const groups = this.groups();
        return this.transactions().filter(tx => categoryIndexOf(tx, groups) === UNCATEGORIZED);
    });

    readonly uncategorizedNet = computed(() =>
        this.uncategorized().reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    );

    readonly inbox = computed<MerchantBucket[]>(() => {
        const buckets = new Map<string, MerchantBucket>();
        for (const tx of this.uncategorized()) {
            const label = partyLabel(tx) || '—';
            const id = label.toLocaleLowerCase();
            let bucket = buckets.get(id);
            if (!bucket) {
                bucket = { label, count: 0, net: 0, last: 0, sample: tx };
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

    // ── your rules ───────────────────────────────────────────

    readonly myRules = computed<MyRule[]>(() => {
        const txs = this.transactions();
        const emojiOf = new Map(this.groups().map(group => [group.title, group.emoji]));
        return this.personal().flatMap(entry => entry.keys.map(key => ({
            category: entry.title,
            emoji: emojiOf.get(entry.title) ?? '',
            key,
            note: entry.notes?.[key] ?? '',
            hits: txs.filter(tx => textMatches(key, tx)).length,
        })));
    });

    readonly myPins = computed(() => this.personal().reduce((sum, entry) => sum + (entry.txIds?.length ?? 0), 0));

    /** Categories you can point a rule at, in the order they are listed. */
    readonly targets = computed(() => this.groups().map(group => ({ title: group.title, emoji: group.emoji })));

    readonly ruleDraft = signal('');
    readonly noteDraft = signal('');
    readonly categoryDraft = signal('');

    onRuleInput(event: Event): void {
        this.ruleDraft.set((event.target as HTMLInputElement).value);
    }

    onNoteInput(event: Event): void {
        this.noteDraft.set((event.target as HTMLInputElement).value);
    }

    onCategoryDraft(event: Event): void {
        this.categoryDraft.set((event.target as HTMLSelectElement).value);
    }

    /** From the «Мої правила» panel: text + category + optional note. */
    addFromPanel(event?: Event): void {
        event?.preventDefault();
        const key = this.ruleDraft().trim();
        const category = this.categoryDraft();
        if (!key || !category) return;
        this.categories.addRule(category, key, this.noteDraft());
        this.toast.success(`«${key}» → ${category}`);
        this.ruleDraft.set('');
        this.noteDraft.set('');
    }

    /** From a category's own panel: the category is the selected one. */
    addToSelected(event?: Event): void {
        event?.preventDefault();
        const key = this.ruleDraft().trim();
        const group = this.selectedGroup();
        if (!key || !group) return;
        this.categories.addRule(group.title, key, this.noteDraft());
        this.ruleDraft.set('');
        this.noteDraft.set('');
    }

    removeRule(category: string, key: string): void {
        this.categories.removeRule(category, key);
        this.toast.success(`Правило «${key}» видалено`);
    }

    unpin(id: string): void {
        const group = this.selectedGroup();
        if (group) this.categories.unpin(group.title, id);
    }

    /** Suggestions for the rule box: this month's descriptions, «Інше» first. */
    readonly suggestions = computed(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        const push = (label: string) => {
            const id = label.toLocaleLowerCase();
            if (label && !seen.has(id)) { seen.add(id); out.push(label); }
        };
        this.inbox().forEach(bucket => push(bucket.label));
        this.transactions().forEach(tx => push(partyLabel(tx)));
        return out.slice(0, 200);
    });

    // ── a category ───────────────────────────────────────────

    readonly selectedIndex = computed(() => this.groups().findIndex(g => g.title === this.selected()));
    readonly selectedGroup = computed(() => this.groups()[this.selectedIndex()] ?? null);

    /** The built-in rules of the selected category, with this month's hits. */
    readonly builtin = computed<BuiltinRule[]>(() => {
        const group = this.selectedGroup();
        if (!group) return [];
        const txs = this.transactions();
        return (group.keys ?? []).map(key => {
            const k = String(key).trim();
            const isMcc = isMccKey(k);
            const [from, to] = k.includes('-') ? k.split('-').map(Number) : [Number(k), Number(k)];
            const hits = isMcc
                ? txs.filter(tx => [tx.mcc, tx.originalMcc].some(code => code >= from && code <= to)).length
                : txs.filter(tx => textMatches(k, tx)).length;
            const kind = isMcc ? 'MCC' as const : k.startsWith('^') ? 'Starts' as const : 'Merchant' as const;
            return { key: kind === 'Starts' ? k.slice(1) : k, kind, hits };
        }).sort((a, b) => b.hits - a.hits);
    });

    /** Built-in rules shown before «show all» — the ones that caught something first. */
    readonly showAllBuiltin = signal(false);

    /** Your rules on the selected category. */
    readonly selectedRules = computed(() => this.myRules().filter(rule => rule.category === this.selected()));

    readonly pinned = computed(() => {
        const entry = this.personal().find(item => item.title === this.selected());
        if (!entry?.txIds?.length) return [];
        const byId = new Map(this.transactions().map(tx => [tx.id, tx]));
        return entry.txIds.map(id => ({ id, tx: byId.get(id) ?? null }));
    });

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
                lost.push({ tx, to: groups[winner]?.title ?? '—', color: this.colors.colorFor(groups[winner]?.title) });
            }
        }
        won.sort((a, b) => b.time - a.time);
        return { won, lost };
    });

    // ── picker («Інше» rows) ─────────────────────────────────

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
        const title = this.groups()[choice.index]?.title;
        if (!open || !title) return;
        if (!this.plus()) this.categories.setMode('plus');
        this.categories.assign(open.bucket.sample, title, choice.mode);
        this.toast.success(`«${open.bucket.label}» → ${title}`);
        this.closePicker();
    }

    openTransaction(tx: ITransaction): void {
        this.monobank.rememberTransaction(tx);
        this.router.navigate(['/transactions', tx.id], { state: { transaction: tx } });
    }
}
