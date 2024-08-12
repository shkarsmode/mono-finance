import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, first, firstValueFrom } from 'rxjs';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    public readonly categoryGroups$: BehaviorSubject<ICategoryGroup[] | any> =
        new BehaviorSubject(null);

    constructor(
        private readonly http: HttpClient,
        private readonly monobankService: MonobankService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
    ) {
        // this.init();
        this.monobankService.categoryGroups$ = this.categoryGroups$;
        this.initTransactionsUpdatesObserver();
    }

    private updateCategories(categories: ICategoryGroup[]): void {
        // const stringifiedCategories = JSON.stringify(categories);
        this.categoryGroups$.next(categories);
        this.http
            .post<string>(
                `${this.basePathApi}/users/update-categories`,
                categories
            )
            .pipe(first())
            .subscribe((affected) =>
                console.log('Update Categories Affected: ', affected)
            );
    }

    private initTransactionsUpdatesObserver(): void {
        this.monobankService.currentTransactions$
            .subscribe(
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
        // this.localStorageService.set(LocalStorage.MyCategoryGroups, [
        //     ...updatedGroups,
        //     group,
        // ]);
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
        // let groups = this.localStorageService.get(
        //     LocalStorage.MyCategoryGroups
        // ) as ICategoryGroup[];

        let groups = this.categoryGroups$.getValue();
        console.log(groups);

        // groups = this.getDefaultGroupsIfNotExist(groups);

        if (!groups) {
            return;
        }

        groups.forEach((group: any) => group.amount = 0);

        transactions.forEach((transaction) => {
            let isFit = false;
            groups.forEach((group: any) => {
                isFit = group.keys.some((key: any) =>
                    transaction.description
                        .toLocaleLowerCase()
                        .includes(key.toLocaleLowerCase())
                );
                isFit && (group.amount += +transaction.amount);
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
