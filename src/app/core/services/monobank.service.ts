import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AppRouteEnum, LocalStorage } from '@core/enums';
import { IAccountInfo, ICategoryGroup, ICurrency, ITransaction } from '@core/interfaces';
import { BASE_PATH_API, MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, Observable, catchError, first, of, tap } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

@Injectable({
    providedIn: 'root',
})
export class MonobankService {
    public readonly activeCardId$: BehaviorSubject<string> =
        new BehaviorSubject<string>('');
    public readonly currentTransactions$: BehaviorSubject<
        ITransaction[] | any
    > = new BehaviorSubject([]);
    public readonly clientInfo$: BehaviorSubject<IAccountInfo | any> =
        new BehaviorSubject({});
    public categoryGroups$: BehaviorSubject<ICategoryGroup[] | any> =
        new BehaviorSubject(null);
    public activeMonth: number = new Date().getMonth() + 1;

    constructor(
        private readonly router: Router,
        private readonly http: HttpClient,
        private readonly localStorageService: LocalStorageService,
        @Inject(MONOBANK_API) private readonly monobankApi: string,
        @Inject(BASE_PATH_API) private readonly basePathApi: string
    ) {}

    public setActiveCardId(activeCardId: string): void {
        const currentCardId = this.localStorageService.get(
            LocalStorage.MonobankActiveCardId
        );
        this.activeCardId$.next(activeCardId);
        if (currentCardId === activeCardId) return;

        this.localStorageService.set(
            LocalStorage.MonobankActiveCardId,
            activeCardId
        );
        this.updateActiveCardId();
    }

    private updateActiveCardId(): void {
        const activeCardId = this.localStorageService.get<string>(
            LocalStorage.MonobankActiveCardId
        );
        if (!activeCardId) return;

        this.getTransactions(this.activeMonth).pipe(first()).subscribe();
    }

    private setDefaultCardBasedOnAmount(clientInfo: IAccountInfo): void {
        let activeIndex = 0;
        clientInfo.accounts.forEach((account, index) => {
            if (
                clientInfo.accounts[activeIndex].balance -
                    clientInfo.accounts[activeIndex].creditLimit <
                account.balance - account.creditLimit
            ) {
                activeIndex = index;
            }
        });
        const activeCardId = clientInfo.accounts[activeIndex].id;
        this.activeCardId$.next(activeCardId);

        this.localStorageService.set(
            LocalStorage.MonobankActiveCardId,
            activeCardId
        );
    }

    public get monobankActiveCardId(): string {
        return this.localStorageService.get(LocalStorage.MonobankActiveCardId);
    }

    public getActualCurrency(): Observable<ICurrency[]> {
        const currencyApiUrl = `${this.basePathApi}/currency`;
        return this.http.get<ICurrency[]>(currencyApiUrl);

        // if (this.shouldSendQuery(LocalStorage.MonobankCurrency)) {
        //     return this.http.get<ICurrency[]>(currencyApiUrl).pipe(
        //         catchError(() =>
        //             of(this.getLocalStorageData(LocalStorage.MonobankCurrency))
        //         ),
        //         tap((currency) =>
        //             this.updateLocalStorage(
        //                 LocalStorage.MonobankCurrency,
        //                 currency
        //             )
        //         )
        //     );
        // }

        // return of(this.getLocalStorageData(LocalStorage.MonobankCurrency));
    }

    public testAuthenticationAccess(): Observable<IAccountInfo | any> {
        const clientInfoApiUrl = `${this.monobankApi}/personal/client-info`;
        return this.http
            .get<IAccountInfo>(clientInfoApiUrl)
            .pipe(catchError((error) => this.handleClientInfoError(error)));
    }

    public getClientInfo(): Observable<IAccountInfo | any> {
        const clientInfoApiUrl = `${this.basePathApi}/users/my`;

        return this.http.get<IAccountInfo>(clientInfoApiUrl).pipe(
            tap((clientInfo) => {
                this.clientInfo$.next(clientInfo);
                console.log(clientInfo.categoryGroups);

                if (clientInfo.categoryGroups) {
                    this.categoryGroups$.next(clientInfo.categoryGroups);
                }
                const activeCardId = localStorage.getItem(
                    LocalStorage.MonobankActiveCardId
                );
                if (!activeCardId) {
                    this.setDefaultCardBasedOnAmount(clientInfo);
                    this.getTransactions(this.activeMonth);
                } else {
                    this.activeCardId$.next(activeCardId);
                }
            })
        );
    }

    public get monobankTransactionKey(): LocalStorage {
        return (LocalStorage.MonobankTransactions +
            this.monobankActiveCardId) as LocalStorage;
    }

    public getTransactions(month?: number): Observable<ITransaction[] | any> {
        const cardId = localStorage.getItem(LocalStorage.MonobankActiveCardId);
        const transactionsApiUrl = `
            ${this.basePathApi}/transaction/${cardId}/${month}
        `;
        return this.http
            .get<ITransaction[]>(transactionsApiUrl)
            .pipe(
                tap((transactions) =>
                    this.currentTransactions$.next(
                        this.removeDuplicatedTransactionsById(transactions)
                    )
                )
            );
    }

    private shouldSendQuery(key: LocalStorage): boolean {
        const updatedAtObj: { [key: string]: number } =
            this.localStorageService.get(LocalStorage.UpdatedMonobankDataAt);

        if (!updatedAtObj || !(key in updatedAtObj)) {
            if (
                !this.localStorageService.get<string>(
                    LocalStorage.MonobankToken
                )
            ) {
                this.router.navigateByUrl(AppRouteEnum.Login);
            }
            console.error('You have to authorize');
            return true;
        }

        return updatedAtObj[key] < this.expiryTime;
    }

    private get expiryTime(): number {
        return Date.now() - 60000;
    }

    private handleClientInfoError(error: any): Observable<IAccountInfo | any> {
        const clientInfo = this.getLocalStorageData(
            LocalStorage.MonobankClientInfo
        ) as IAccountInfo;

        if (!clientInfo) {
            return of({ error: 'Invalid token' });
        }

        this.updateLocalStorage(LocalStorage.MonobankClientInfo, clientInfo);
        return of(clientInfo);
    }

    private removeDuplicatedTransactionsById(
        transactions: ITransaction[]
    ): ITransaction[] {
        const duplicatedElementsCount: { [key: string]: number } = {};

        transactions.forEach((e) => {
            duplicatedElementsCount[e.id] =
                duplicatedElementsCount[e.id] >= 0
                    ? duplicatedElementsCount[e.id] + 1
                    : 0;
        });

        const duplicatedElementsArr = Object.entries(duplicatedElementsCount)
            .filter((el) => el[1])
            .map((el) => el[0]);

        duplicatedElementsArr.forEach((duplicated) => {
            const firstDuplicatedElementIndex = transactions.findIndex(
                (transaction) =>
                    transaction?.id && transaction?.id === duplicated
            );
            console.log('Duplicated', duplicated);
            transactions[firstDuplicatedElementIndex] = undefined as any;
        });

        return transactions.filter((transaction) => !!transaction);
    }

    private getLocalStorageData(key: LocalStorage): any {
        return this.localStorageService.get(key);
    }

    private updateLocalStorage(key: LocalStorage, value: any): void {
        this.localStorageService.set(key, value);
        const updatedAtObj: { [key: string]: number } =
            this.localStorageService.get(LocalStorage.UpdatedMonobankDataAt) ||
            {};

        updatedAtObj[key] = Date.now();

        this.localStorageService.set(
            LocalStorage.UpdatedMonobankDataAt,
            updatedAtObj
        );
    }
}
