import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, combineLatest, first, tap } from 'rxjs';
import { LoadingService } from './loading.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    /**
     * Categories as stored on the user record — names, emoji and match keys, with no
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
    ) {
        this.monobankService.categoryGroups$ = this.serverGroups$;

        // Totals are DERIVED from both inputs. Previously they were recomputed only
        // when transactions emitted, so whenever the categories finished loading
        // after the transactions — the usual order — nothing ever recomputed and
        // every category rendered 0,00.
        combineLatest([
            this.monobankService.currentTransactions$,
            this.serverGroups$,
        ]).subscribe(([transactions, groups]) => {
            this.categoryGroups$.next(this.withTotals(groups, transactions ?? []));
        });
    }

    /**
     * Sum each category's matching transactions. Returns new objects — mutating the
     * stored ones in place made the totals depend on emission order and meant the
     * server copy silently carried a stale `amount`.
     */
    private withTotals(groups: ICategoryGroup[], transactions: ITransaction[]): ICategoryGroup[] {
        if (!groups?.length) {
            return [];
        }

        return groups.map(group => {
            const keys = (group.keys ?? [])
                .map(key => (key ?? '').trim())
                .filter(Boolean);

            const amount = transactions.reduce((sum, transaction) => {
                return this.matches(keys, transaction) ? sum + (Number(transaction.amount) || 0) : sum;
            }, 0);

            return { ...group, amount };
        });
    }

    /** A numeric key is an MCC; anything else is a case-insensitive text match. */
    private matches(keys: string[], transaction: ITransaction): boolean {
        if (!keys.length) return false;

        const description = (transaction.description ?? '').toLocaleLowerCase();
        const merchant = ((transaction as any).merchantName ?? '').toLocaleLowerCase();
        const counter = (transaction.counterName ?? '').toLocaleLowerCase();

        return keys.some(key => {
            if (/^\d+$/.test(key)) {
                const mcc = Number(key);
                return transaction.mcc === mcc || transaction.originalMcc === mcc;
            }
            const needle = key.toLocaleLowerCase();
            return description.includes(needle) || merchant.includes(needle) || counter.includes(needle);
        });
    }

    /** Persist the category definitions. Totals are derived, so they are never sent. */
    private updateCategories(categories: ICategoryGroup[]): void {
        const definitions = categories.map(({ emoji, title, keys }) => ({
            emoji,
            title,
            keys,
            amount: 0,
        })) as ICategoryGroup[];

        this.serverGroups$.next(definitions);

        this.loadingService.loading$.next(true);
        this.http
            .post<string>(`${this.basePathApi}/users/update-categories`, definitions)
            .pipe(first(), tap(() => this.loadingService.loading$.next(false)))
            .subscribe();
    }

    public changeOrdering(groups: ICategoryGroup[]): void {
        this.updateCategories(groups);
    }

    public set(group: ICategoryGroup): void {
        const groups = this.serverGroups$.getValue();
        const without = groups.filter(existing => existing.title !== group.title);
        this.updateCategories([...without, group]);
    }

    public delete(group: ICategoryGroup): void {
        const groups = this.serverGroups$.getValue();
        this.updateCategories(groups.filter(existing => existing.title !== group.title));
    }
}
