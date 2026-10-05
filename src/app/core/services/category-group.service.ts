import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { AssignMode, assignTransaction, summarize, toDefinitions } from '@core/helpers/categorize';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { ToastService } from '@shared/components';
import { BehaviorSubject, combineLatest, first } from 'rxjs';
import { LoadingService } from './loading.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    /**
     * Categories as stored on the user record — names, emoji and rules, with no
     * totals. MonobankService writes client-info straight into this subject.
     */
    public readonly serverGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    /** Categories with the period's totals filled in. This is what the UI reads. */
    public readonly categoryGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    constructor(
        private readonly http: HttpClient,
        private readonly monobankService: MonobankService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
        private readonly loadingService: LoadingService,
        private readonly toast: ToastService,
    ) {
        this.monobankService.categoryGroups$ = this.serverGroups$;

        // Totals are DERIVED from both inputs, so they are right whichever arrives
        // first. Each transaction lands in exactly one category (see categorize.ts).
        combineLatest([
            this.monobankService.currentTransactions$,
            this.serverGroups$,
        ]).subscribe(([transactions, groups]) => {
            this.categoryGroups$.next(this.withTotals(groups ?? [], transactions ?? []));
        });
    }

    /** The stored definitions, current as of the last edit. */
    public get definitions(): ICategoryGroup[] {
        return this.serverGroups$.getValue() ?? [];
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
                    this.toast.error('Categories were not saved — check the connection and try again.');
                },
            });
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

    /** Put a transaction into an existing category. */
    public assign(tx: ITransaction, targetIndex: number, mode: AssignMode): void {
        this.replaceAll(assignTransaction(this.definitions, tx, targetIndex, mode));
    }

    /** Create a category and put the transaction into it, in one save. */
    public createAndAssign(tx: ITransaction, draft: { title: string; emoji?: string }, mode: AssignMode): void {
        const groups = [...this.definitions, { emoji: draft.emoji ?? '', title: draft.title.trim(), keys: [], amount: 0 }];
        this.replaceAll(assignTransaction(groups, tx, groups.length - 1, mode));
    }

    /** Add a rule to a category, removing the identical rule from every other one. */
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
