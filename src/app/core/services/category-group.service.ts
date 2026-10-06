import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { buildAutoCategories } from '@core/helpers/auto-categories';
import { OWN_MONEY_TITLES } from '@core/helpers/category-titles';
import { AssignMode, assignTransaction, summarize, toDefinitions } from '@core/helpers/categorize';
import { buildFlowContext, CountMode, EMPTY_FLOW_CONTEXT, FlowContext } from '@core/helpers/flows';
import { IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { ToastService } from '@shared/components';
import { BehaviorSubject, combineLatest, first } from 'rxjs';
import { LoadingService } from './loading.service';
import { MonobankService } from './monobank.service';

/** 'auto' — the built-in MCC categories; 'mine' — the ones you defined. */
export type CategoryMode = 'auto' | 'mine';

const MODE_STORAGE = 'finance-category-mode';
const COUNT_STORAGE = 'finance-count-mode';

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    try {
        const value = localStorage.getItem(key) as T | null;
        return value && allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function writePref(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    /**
     * YOUR categories as stored on the user record — names, emoji and rules, no
     * totals. MonobankService writes client-info straight into this subject.
     */
    public readonly serverGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    /** The ACTIVE categories (auto or mine) with the period's totals. The UI reads this. */
    public readonly categoryGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    /** Which category set is shown. Automatic by default. */
    public readonly mode$ = new BehaviorSubject<CategoryMode>(readPref(MODE_STORAGE, ['auto', 'mine'], 'auto'));

    /**
     * How Spent and Income are counted. 'real' (default) leaves out money that only
     * changed pockets and nets refunds; 'all' is the raw statement.
     */
    public readonly countMode$ = new BehaviorSubject<CountMode>(readPref(COUNT_STORAGE, ['real', 'all'], 'real'));

    /** Who you are and which jars are yours — needed to recognise your own money. */
    public readonly flowContext$ = new BehaviorSubject<FlowContext>(EMPTY_FLOW_CONTEXT);

    constructor(
        private readonly http: HttpClient,
        private readonly monobankService: MonobankService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
        private readonly loadingService: LoadingService,
        private readonly toast: ToastService,
    ) {
        this.monobankService.categoryGroups$ = this.serverGroups$;

        this.monobankService.clientInfo$.subscribe((info: IAccountInfo | null) => {
            if (!info || !info.name) return;
            const ownJars = info.ownJars?.length ? info.ownJars : (info.jars ?? []).map(jar => jar.title);
            const next = buildFlowContext(info.name, ownJars);
            const current = this.flowContext$.getValue();
            // keep the same object when nothing changed, so memoized auto categories survive
            if (!sameContext(current, next)) this.flowContext$.next(next);
        });

        // Totals are DERIVED from every input, so they are right whichever arrives first.
        combineLatest([
            this.monobankService.currentTransactions$,
            this.serverGroups$,
            this.mode$,
            this.flowContext$,
        ]).subscribe(([transactions, mine, mode, ctx]) => {
            const groups = mode === 'auto' ? buildAutoCategories(ctx) : (mine ?? []);
            this.categoryGroups$.next(this.withTotals(groups, transactions ?? []));
        });
    }

    /** Your stored definitions, current as of the last edit. */
    public get definitions(): ICategoryGroup[] {
        return this.serverGroups$.getValue() ?? [];
    }

    public get mode(): CategoryMode {
        return this.mode$.getValue();
    }

    public setMode(mode: CategoryMode): void {
        if (mode === this.mode) return;
        writePref(MODE_STORAGE, mode);
        this.mode$.next(mode);
    }

    public setCountMode(mode: CountMode): void {
        if (mode === this.countMode$.getValue()) return;
        writePref(COUNT_STORAGE, mode);
        this.countMode$.next(mode);
    }

    /** The automatic categories for this profile (independent of the active mode). */
    public get autoGroups(): ICategoryGroup[] {
        return buildAutoCategories(this.flowContext$.getValue());
    }

    private withTotals(groups: ICategoryGroup[], transactions: ITransaction[]): ICategoryGroup[] {
        if (!groups.length) return [];
        const { byIndex } = summarize(transactions, groups);
        return groups.map((group, index) => ({
            ...group,
            amount: byIndex[index].net,
            spent: byIndex[index].spent,
            income: byIndex[index].income,
            count: byIndex[index].count,
        }));
    }

    /** Persist the whole list. Totals are derived, so they are never sent. */
    public replaceAll(groups: ICategoryGroup[]): void {
        const definitions = toDefinitions(groups);
        this.serverGroups$.next(definitions);

        this.loadingService.loading$.next(true);
        this.http
            .post<unknown>(`${this.basePathApi}/users/update-categories`, definitions)
            .pipe(first())
            .subscribe({
                next: () => this.loadingService.loading$.next(false),
                error: () => {
                    this.loadingService.loading$.next(false);
                    this.toast.error('Категорії не збереглися — перевірте з’єднання й спробуйте ще раз.');
                },
            });
    }

    /**
     * Start (or extend) your own categories from the automatic ones. 'replace' swaps
     * your list for them; 'append' adds only the ones whose names you do not have.
     * Code rules become text rules on the way — your copy is plain, editable data.
     */
    public adoptAuto(how: 'replace' | 'append', only?: string[]): void {
        const auto = this.autoGroups.filter(g => !only || only.includes(g.title));
        // your jars by their real names, so "Поповнення «Хата»" outranks the generic
        // "Поповнення «" that files other people's jars under Donations
        const info = this.monobankService.clientInfo$.getValue() as IAccountInfo | null;
        const jarTitles = info?.ownJars?.length ? info.ownJars : (info?.jars ?? []).map(j => j.title);
        const ownJarKeys = jarTitles.flatMap(t => [`Поповнення «${t}»`, `Регулярне поповнення «${t}»`]);
        const copies: ICategoryGroup[] = auto.map(g => ({
            emoji: g.emoji,
            title: g.title,
            keys: OWN_MONEY_TITLES.includes(g.title) ? [...OWN_MONEY_KEYS, ...ownJarKeys] : [...g.keys],
            excluded: g.excluded,
            direction: g.direction,
            amount: 0,
        }));
        if (how === 'replace') {
            this.replaceAll(copies);
            return;
        }
        const taken = new Set(this.definitions.map(g => g.title.trim().toLocaleLowerCase()));
        this.replaceAll([...this.definitions, ...copies.filter(c => !taken.has(c.title.toLocaleLowerCase()))]);
    }

    public changeOrdering(groups: ICategoryGroup[]): void {
        this.replaceAll(groups);
    }

    public move(fromIndex: number, toIndex: number): void {
        const groups = [...this.definitions];
        if (fromIndex === toIndex || !groups[fromIndex]) return;
        const [moved] = groups.splice(fromIndex, 1);
        groups.splice(Math.max(0, Math.min(toIndex, groups.length)), 0, moved);
        this.replaceAll(groups);
    }

    /**
     * Create or edit. Matching on the ORIGINAL title, so a rename edits the
     * category in place instead of leaving the old one behind as a duplicate.
     */
    public upsert(originalTitle: string | null, group: ICategoryGroup): void {
        const groups = [...this.definitions];
        const index = originalTitle === null ? -1 : groups.findIndex(g => g.title === originalTitle);
        if (index >= 0) groups[index] = { ...groups[index], ...group };
        else groups.push(group);
        this.replaceAll(groups);
    }

    /** Back-compat for the old editor: create-or-replace by title. */
    public set(group: ICategoryGroup): void {
        this.upsert(group.title, group);
    }

    public delete(group: ICategoryGroup): void {
        this.replaceAll(this.definitions.filter(existing => existing.title !== group.title));
    }

    public isTitleTaken(title: string, exceptTitle: string | null = null): boolean {
        const wanted = title.trim().toLocaleLowerCase();
        return this.definitions.some(g => g.title !== exceptTitle && g.title.trim().toLocaleLowerCase() === wanted);
    }

    /** Put a transaction into one of YOUR categories. */
    public assign(tx: ITransaction, targetIndex: number, mode: AssignMode): void {
        this.replaceAll(assignTransaction(this.definitions, tx, targetIndex, mode));
    }

    /** Create one of YOUR categories and put the transaction into it, in one save. */
    public createAndAssign(tx: ITransaction, draft: { title: string; emoji?: string }, mode: AssignMode): void {
        const groups = [...this.definitions, { emoji: draft.emoji ?? '', title: draft.title.trim(), keys: [], amount: 0 }];
        this.replaceAll(assignTransaction(groups, tx, groups.length - 1, mode));
    }

    /** Add a rule to one of your categories, removing the identical rule from every other one. */
    public addKey(targetIndex: number, key: string): void {
        const clean = key.trim();
        if (!clean) return;
        const lower = clean.toLocaleLowerCase();
        const groups = this.definitions.map((group, index) => {
            const keys = (group.keys ?? []).filter(k => String(k).trim().toLocaleLowerCase() !== lower);
            if (index === targetIndex) keys.push(clean);
            return { ...group, keys };
        });
        this.replaceAll(groups);
    }

    public removeKey(targetIndex: number, key: string): void {
        const groups = this.definitions.map((group, index) =>
            index === targetIndex ? { ...group, keys: (group.keys ?? []).filter(k => k !== key) } : group,
        );
        this.replaceAll(groups);
    }

    public unpin(targetIndex: number, txId: string): void {
        const groups = this.definitions.map((group, index) =>
            index === targetIndex ? { ...group, txIds: (group.txIds ?? []).filter(id => id !== txId) } : group,
        );
        this.replaceAll(groups);
    }
}

/**
 * "Own money" is a code rule in the automatic set; a copy in your own categories
 * needs it spelled as text. The honest totals do not depend on this — they always
 * recognise own money on their own.
 */
const OWN_MONEY_KEYS = [
    'Часткове зняття банки', 'Виплата банки', 'Округлення балансу', 'Reserve',
    'З Білої картки', 'На білу картку', 'З Чорної картки', 'На чорну картку',
    'З доларової картки', 'На доларову картку', 'З єврової картки', 'На єврову картку',
    'Поповнення депозиту', 'Виплата депозиту',
];

function sameContext(a: FlowContext, b: FlowContext): boolean {
    if (a.surnames.join() !== b.surnames.join() || a.firstNames.join() !== b.firstNames.join()) return false;
    if (a.ownJars.size !== b.ownJars.size) return false;
    for (const jar of a.ownJars) if (!b.ownJars.has(jar)) return false;
    return true;
}
