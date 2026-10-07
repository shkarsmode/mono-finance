import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { buildAutoCategories } from '@core/helpers/auto-categories';
import { AssignMode, categoryIndexOf, ruleKeyFor, summarize } from '@core/helpers/categorize';
import { buildFlowContext, CountMode, EMPTY_FLOW_CONTEXT, FlowContext } from '@core/helpers/flows';
import { IAccountInfo, ICategoryGroup, IPersonalRules, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { ToastService } from '@shared/components';
import { BehaviorSubject, combineLatest, first } from 'rxjs';
import { LoadingService } from './loading.service';
import { MonobankService } from './monobank.service';

/**
 * 'auto' — the built-in categories as they are; 'plus' — the same categories with
 * YOUR rules on top («ФОП Красний» → Дім). 'plus' is the default.
 */
export type CategoryMode = 'auto' | 'plus';

/** A new key: the meaning of the old one changed (it used to switch to your own categories). */
const MODE_STORAGE = 'finance-category-mode-v2';
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

/** Only the new shape counts; the old free-form categories stored before are ignored. */
function personalRulesOf(stored: unknown): IPersonalRules[] {
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is IPersonalRules =>
        !!item && item.kind === 'rules' && typeof item.title === 'string' && Array.isArray(item.keys));
}

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    /**
     * Exactly what is stored on the user record. MonobankService writes client-info
     * straight into this subject; only the `kind: 'rules'` entries are read.
     */
    public readonly serverGroups$: BehaviorSubject<unknown[]> = new BehaviorSubject<unknown[]>([]);

    /** Your rules, one entry per automatic category they point to. */
    public readonly rules$ = new BehaviorSubject<IPersonalRules[]>([]);

    /** The ACTIVE categories (auto, or auto with your rules), without totals. */
    public readonly activeDefinitions$ = new BehaviorSubject<ICategoryGroup[]>([]);

    /** The ACTIVE categories with the period's totals. The UI reads this. */
    public readonly categoryGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    /** Which category set is shown. Automatic plus your rules by default. */
    public readonly mode$ = new BehaviorSubject<CategoryMode>(readPref(MODE_STORAGE, ['auto', 'plus'], 'plus'));

    /**
     * How Spent and Income are counted. 'real' (default) leaves out money that only
     * changed pockets and nets refunds; 'all' is the raw statement.
     */
    public readonly countMode$ = new BehaviorSubject<CountMode>(readPref(COUNT_STORAGE, ['real', 'all'], 'real'));

    /** Who you are and which jars are yours — needed to recognise your own money. */
    public readonly flowContext$ = new BehaviorSubject<FlowContext>(EMPTY_FLOW_CONTEXT);

    /** The last merge, reused while its inputs are the same objects (keeps the engine's cache warm). */
    private merged: { auto: ICategoryGroup[]; rules: IPersonalRules[]; result: ICategoryGroup[] } | null = null;

    constructor(
        private readonly http: HttpClient,
        private readonly monobankService: MonobankService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
        private readonly loadingService: LoadingService,
        private readonly toast: ToastService,
    ) {
        this.monobankService.categoryGroups$ = this.serverGroups$;

        this.serverGroups$.subscribe(stored => this.rules$.next(personalRulesOf(stored)));

        this.monobankService.clientInfo$.subscribe((info: IAccountInfo | null) => {
            if (!info || !info.name) return;
            const ownJars = info.ownJars?.length ? info.ownJars : (info.jars ?? []).map(jar => jar.title);
            const next = buildFlowContext(info.name, ownJars);
            const current = this.flowContext$.getValue();
            // keep the same object when nothing changed, so memoized auto categories survive
            if (!sameContext(current, next)) this.flowContext$.next(next);
        });

        combineLatest([this.rules$, this.mode$, this.flowContext$]).subscribe(([rules, mode, ctx]) => {
            const auto = buildAutoCategories(ctx);
            this.activeDefinitions$.next(mode === 'auto' ? auto : this.withRules(auto, rules));
        });

        // Totals are DERIVED from every input, so they are right whichever arrives first.
        combineLatest([this.monobankService.currentTransactions$, this.activeDefinitions$]).subscribe(
            ([transactions, groups]) => this.categoryGroups$.next(this.withTotals(groups, transactions ?? [])),
        );
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

    public get rules(): IPersonalRules[] {
        return this.rules$.getValue();
    }

    /** How many rules and moved transactions you have, for the «+ мої правила» badge. */
    public get ruleCount(): number {
        return this.rules.reduce((sum, entry) => sum + entry.keys.length + (entry.txIds?.length ?? 0), 0);
    }

    // ── your rules ─────────────────────────────────────────────

    /** «Everything that says X goes to <category>». The same text leaves every other category. */
    public addRule(title: string, key: string, note?: string): void {
        const clean = key.trim();
        if (!clean || !this.autoGroups.some(group => group.title === title)) return;
        const lower = clean.toLocaleLowerCase();
        const next = this.rules.map(entry => this.withoutKey(entry, lower));
        const target = this.entryFor(next, title);
        target.keys = [...target.keys, clean];
        if (note?.trim()) target.notes = { ...(target.notes ?? {}), [clean]: note.trim() };
        this.save(next);
    }

    public removeRule(title: string, key: string): void {
        const lower = key.trim().toLocaleLowerCase();
        this.save(this.rules.map(entry => (entry.title === title ? this.withoutKey(entry, lower) : entry)));
    }

    public setRuleNote(title: string, key: string, note: string): void {
        this.save(this.rules.map(entry => {
            if (entry.title !== title || !entry.keys.includes(key)) return entry;
            const notes = { ...(entry.notes ?? {}) };
            if (note.trim()) notes[key] = note.trim();
            else delete notes[key];
            return { ...entry, notes };
        }));
    }

    /** Move ONE transaction into a category, whatever the rules say. */
    public pin(tx: ITransaction, title: string): void {
        const next = this.rules.map(entry => ({ ...entry, txIds: (entry.txIds ?? []).filter(id => id !== tx.id) }));
        const target = this.entryFor(next, title);
        target.txIds = [...(target.txIds ?? []), tx.id];
        this.save(next);
    }

    public unpin(title: string, txId: string): void {
        this.save(this.rules.map(entry =>
            entry.title === title ? { ...entry, txIds: (entry.txIds ?? []).filter(id => id !== txId) } : entry,
        ));
    }

    /**
     * The category picker's two choices: 'merchant' writes a rule for everything like
     * this transaction; 'single' moves only this one. If the result would still not
     * land where asked (e.g. a longer rule elsewhere wins), the transaction is pinned.
     */
    public assign(tx: ITransaction, title: string, mode: AssignMode): void {
        if (mode === 'single') {
            this.pin(tx, title);
            return;
        }
        const key = ruleKeyFor(tx);
        if (!key) return;
        this.addRule(title, key);
        const groups = this.withRules(this.autoGroups, this.rules);
        const index = categoryIndexOf(tx, groups);
        if (groups[index]?.title !== title) this.pin(tx, title);
    }

    /** The text a rule for this transaction would be written as. */
    public ruleKeyFor(tx: ITransaction): string {
        return ruleKeyFor(tx);
    }

    // ── internals ──────────────────────────────────────────────

    private entryFor(entries: IPersonalRules[], title: string): IPersonalRules {
        let entry = entries.find(item => item.title === title);
        if (!entry) {
            entry = { kind: 'rules', title, keys: [] };
            entries.push(entry);
        }
        return entry;
    }

    private withoutKey(entry: IPersonalRules, lower: string): IPersonalRules {
        const keys = entry.keys.filter(key => key.trim().toLocaleLowerCase() !== lower);
        if (keys.length === entry.keys.length) return { ...entry };
        const notes = { ...(entry.notes ?? {}) };
        for (const key of Object.keys(notes)) if (key.trim().toLocaleLowerCase() === lower) delete notes[key];
        return { ...entry, keys, notes };
    }

    /** Your rules folded into the automatic categories they point to. */
    private withRules(auto: ICategoryGroup[], rules: IPersonalRules[]): ICategoryGroup[] {
        if (!rules.length) return auto;
        if (this.merged && this.merged.auto === auto && this.merged.rules === rules) return this.merged.result;
        const byTitle = new Map(rules.map(entry => [entry.title, entry]));
        const result = auto.map(group => {
            const own = byTitle.get(group.title);
            if (!own || (!own.keys.length && !own.txIds?.length)) return group;
            return {
                ...group,
                rules: [...own.keys],
                ruleNotes: own.notes ?? {},
                txIds: [...(group.txIds ?? []), ...(own.txIds ?? [])],
            };
        });
        this.merged = { auto, rules, result };
        return result;
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

    /** Persist your rules. Empty entries are dropped; the old free-form categories go with them. */
    private save(entries: IPersonalRules[]): void {
        const clean: IPersonalRules[] = entries
            .map(entry => {
                const out: IPersonalRules = { kind: 'rules', title: entry.title, keys: [...entry.keys] };
                if (entry.txIds?.length) out.txIds = [...entry.txIds];
                const notes = Object.fromEntries(Object.entries(entry.notes ?? {}).filter(([key]) => entry.keys.includes(key)));
                if (Object.keys(notes).length) out.notes = notes;
                return out;
            })
            .filter(entry => entry.keys.length || entry.txIds?.length);

        this.serverGroups$.next(clean);

        this.loadingService.loading$.next(true);
        this.http
            .post<unknown>(`${this.basePathApi}/users/update-categories`, clean)
            .pipe(first())
            .subscribe({
                next: () => this.loadingService.loading$.next(false),
                error: () => {
                    this.loadingService.loading$.next(false);
                    this.toast.error('Правила не збереглися — перевірте з’єднання й спробуйте ще раз.');
                },
            });
    }
}

function sameContext(a: FlowContext, b: FlowContext): boolean {
    if (a.surnames.join() !== b.surnames.join() || a.firstNames.join() !== b.firstNames.join()) return false;
    if (a.ownJars.size !== b.ownJars.size) return false;
    for (const jar of a.ownJars) if (!b.ownJars.has(jar)) return false;
    return true;
}
