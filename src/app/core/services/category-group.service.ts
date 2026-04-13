import { HttpClient } from '@angular/common/http';
import { inject, Inject, Injectable } from '@angular/core';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, first, firstValueFrom, tap } from 'rxjs';
import { LoadingService } from './loading.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    public readonly categoryGroups$: BehaviorSubject<ICategoryGroup[]> =
        new BehaviorSubject<ICategoryGroup[]>([]);

    public readonly loadingService: LoadingService = inject(LoadingService);

    constructor(
        private readonly http: HttpClient,
        private readonly monobankService: MonobankService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string
    ) {
        // this.init();
        this.monobankService.categoryGroups$ = this.categoryGroups$;
        this.initTransactionsUpdatesObserver();
    }

    private updateCategories(categories: ICategoryGroup[]): void {
        this.loadingService.loading$.next(true);
        // const stringifiedCategories = JSON.stringify(categories);
        this.categoryGroups$.next(categories);
        this.http
            .post<string>(
                `${this.basePathApi}/users/update-categories`,
                categories
            )
            .pipe(first(), tap(() => {
                this.loadingService.loading$.next(false);
            }))
            .subscribe((affected) =>
                console.log('Update Categories Affected: ', affected)
            );
    }

    private initTransactionsUpdatesObserver(): void {
        this.monobankService.currentTransactions$.subscribe(
            this.processTransactionsBasedOnGroups.bind(this)
        );
    }

    public changeOrdering(groups: ICategoryGroup[]): void {
        const updatedGroups = groups.map((group) => ({ ...group, amount: 0 }));
        this.updateCategories(updatedGroups);
        this.processTransactionsBasedOnGroups();
        // this.localStorageService.set(
        //     LocalStorage.MyCategoryGroups,
        //     updatedGroups
        // );
    }

    public async set(group: ICategoryGroup): Promise<void> {
        const groups = await firstValueFrom(this.categoryGroups$);
        const updatedGroups = groups.filter(
            (oldGroup: any) => oldGroup.title !== group.title
        );
        this.updateCategories([...updatedGroups, group]);
        const transactions = await firstValueFrom(
            this.monobankService.currentTransactions$
        );
        this.processTransactionsBasedOnGroups(transactions);
    }

    public async delete(group: ICategoryGroup): Promise<void> {
        const groups = await firstValueFrom(this.categoryGroups$);
        const updatedGroups = groups.filter(
            (oldGroup: any) => oldGroup.title !== group.title
        );
        this.updateCategories(updatedGroups);
        const transactions = await firstValueFrom(
            this.monobankService.currentTransactions$
        );
        this.processTransactionsBasedOnGroups(transactions);
    }

    // public init(): void {
    //     const firstMonthDay = new Date(new Date().setDate(1)).setUTCHours(
    //         0,
    //         0,
    //         0,
    //         0
    //     );

    //     this.monobankService
    //         .getTransactions(firstMonthDay, Date.now())
    //         .pipe(first())
    //         .subscribe((transactions) => {
    //             if (transactions && !('error' in transactions)) {
    //                 this.transactions = transactions;
    //                 this.processTransactionsBasedOnGroups();
    //             }
    //         });
    // }

    public async processTransactionsBasedOnGroups(
        transactions?: ITransaction[]
    ): Promise<void> {
        if (!transactions) {
            transactions = (await firstValueFrom(
                this.monobankService.currentTransactions$
            )) as ITransaction[];
        }

        let groups = this.categoryGroups$.getValue();

        if (!groups || !groups.length) {
            return;
        }

        groups.forEach((group: any) => (group.amount = 0));

        transactions.forEach((transaction) => {
            groups.forEach((group: any) => {
                const isFit = group.keys.some((key: string) => {
                    const trimmed = key.trim();
                    // MCC match: purely numeric key
                    if (/^\d+$/.test(trimmed)) {
                        return transaction.mcc === Number(trimmed)
                            || transaction.originalMcc === Number(trimmed);
                    }
                    // Text match: description, merchantName, counterName (case-insensitive)
                    const lowerKey = trimmed.toLocaleLowerCase();
                    return (
                        (transaction.description ?? '').toLocaleLowerCase().includes(lowerKey) ||
                        ((transaction as any).merchantName ?? '').toLocaleLowerCase().includes(lowerKey) ||
                        (transaction.counterName ?? '').toLocaleLowerCase().includes(lowerKey)
                    );
                });
                if (isFit) group.amount += +transaction.amount;
            });
        });

        this.categoryGroups$.next(groups);
    }

    private getDefaultGroupsIfNotExist(
        groups: ICategoryGroup[]
    ): ICategoryGroup[] {
        if (groups) return groups;

        const defaultGroups: ICategoryGroup[] = [
            {
                emoji: '💕',
                title: 'Магаз',
                keys: ['Ашан', 'Сільпо', 'Novus'],
                amount: 0,
            },
            {
                emoji: '🛻',
                title: 'Taxi',
                keys: ['Uklon', 'Bolt'],
                amount: 0,
            },
            {
                emoji: '🚘',
                title: 'Getmancar',
                keys: ['getmancar.ua'],
                amount: 0,
            },
        ];

        this.updateCategories(defaultGroups);
        // this.localStorageService.set(
        //     LocalStorage.MyCategoryGroups,
        //     defaultGroups
        // );

        return defaultGroups;
    }
}
