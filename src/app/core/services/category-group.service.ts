import { Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { BehaviorSubject, Observable, first } from 'rxjs';
import { LocalStorageService } from './local-storage.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    private transactions: ITransaction[] = [];
    private readonly categoryGroups$: BehaviorSubject<ICategoryGroup[] | any> =
        new BehaviorSubject(null);

    constructor(
        private readonly monobankService: MonobankService,
        private readonly localStorageService: LocalStorageService
    ) {
        this.init();
    }

    public set(group: ICategoryGroup): void {
        const groups = this.localStorageService.get(
            LocalStorage.MyCategoryGroups
        ) as ICategoryGroup[];
        this.localStorageService.set(LocalStorage.MyCategoryGroups, [
            ...groups,
            group,
        ]);
        this.processTransactionsBasedOnGroups();
    }

    public get(): Observable<ICategoryGroup[]> {
        return this.categoryGroups$;
    }

    public init(): void {
        const firstMonthDay = new Date(new Date().setDate(1)).setUTCHours(
            0,
            0,
            0,
            0
        );

        this.monobankService
            .getTransactions(firstMonthDay, Date.now())
            .pipe(first())
            .subscribe((transactions) => {
                if (transactions && !('error' in transactions)) {
                    this.transactions = transactions;
                    this.processTransactionsBasedOnGroups();
                }
            });
    }

    private processTransactionsBasedOnGroups(): void {
        let groups = this.localStorageService.get(
            LocalStorage.MyCategoryGroups
        ) as ICategoryGroup[];

        groups = this.getDefaultGroupsIfNotExist(groups);

        this.transactions.forEach((transaction) => {
            let isFit = false;
            groups.forEach((group) => {
                isFit = group.keys.some((key) =>
                    transaction.description
                        .toLocaleLowerCase()
                        .includes(key.toLocaleLowerCase())
                );
                isFit && (group.amount += transaction.amount);
            });
        });

        this.categoryGroups$.next(groups);
    }

    private getDefaultGroupsIfNotExist(groups: ICategoryGroup[]): ICategoryGroup[] {
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
        this.localStorageService.set(
            LocalStorage.MyCategoryGroups,
            defaultGroups
        );
        
        return defaultGroups;
    }
}
