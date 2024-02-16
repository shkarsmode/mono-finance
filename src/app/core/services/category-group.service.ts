import { Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { ICategoryGroup, ITransactions } from '@core/interfaces';
import { BehaviorSubject, Observable, first } from 'rxjs';
import { LocalStorageService } from './local-storage.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class CategoryGroupService {
    private readonly categoryGroups$: BehaviorSubject<ICategoryGroup[] | any> = 
        new BehaviorSubject(null);

    constructor(
        private readonly monobankService: MonobankService,
        private readonly localStorageService: LocalStorageService
    ) {
        this.init();
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
                    this.processTransactionsBasedOnGroups(transactions);
                }
            });
    }

    private processTransactionsBasedOnGroups(
        transactions: ITransactions[]
    ): void {
        let groups = this.localStorageService.get(
            LocalStorage.MyCategoryGroups
        ) as ICategoryGroup[];

        if (!groups) {
            const defaultGroups: ICategoryGroup[] = [
                {
                    emoji: '💕',
                    name: 'Магаз',
                    keys: ['Ашан', 'Сільпо', 'Novus'],
                    amount: 0,
                },
                {
                    emoji: '🛻',
                    name: 'Taxi',
                    keys: ['Uklon', 'Bolt'],
                    amount: 0,
                },
                {
                    emoji: '🚘',
                    name: 'Getmancar',
                    keys: ['getmancar.ua'],
                    amount: 0,
                },
            ];
            this.localStorageService.set(
                LocalStorage.MyCategoryGroups,
                defaultGroups
            );
            groups = defaultGroups;
        }

        transactions.forEach((transaction) => {
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

        console.log(groups);

        this.categoryGroups$.next(groups);
    }
}
