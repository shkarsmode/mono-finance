import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AppRouteEnum, LocalStorage } from '@core/enums';
import { IAccountInfo, ICurrency, ITransaction } from '@core/interfaces';
import { BASE_PATH_API, MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, Observable, Subject, catchError, of, tap } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

@Injectable({
    providedIn: 'root',
})
export class MonobankService {
    public readonly transactionsUpdated$: Subject<void> = new Subject();
    public readonly activeCardId$: BehaviorSubject<string> =
        new BehaviorSubject<string>('');

    constructor(
        private readonly router: Router,
        private readonly http: HttpClient,
        private readonly localStorageService: LocalStorageService,
        @Inject(MONOBANK_API) private readonly monobankApi: string,
        @Inject(BASE_PATH_API) private readonly basePathApi: string
    ) {
        this.updateActiveCardId();
    }

    public setActiveCardId(activeCardId: string): void {
        const currentCardId = this.localStorageService.get(
            LocalStorage.MonobankActiveCardId
        );
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
        activeCardId && this.activeCardId$.next(activeCardId);
        this.transactionsUpdated$.next();
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

        return this.http.get<IAccountInfo>(clientInfoApiUrl);
    }

    public get monobankTransactionKey(): LocalStorage {
        return (LocalStorage.MonobankTransactions +
            this.monobankActiveCardId) as LocalStorage;
    }

    public getTransactions(
        dateStart: number,
        dateEnd: number
    ): Observable<ITransaction[] | any> {
        const cardId = localStorage.getItem(LocalStorage.MonobankActiveCardId);
        const transactionsApiUrl = `${this.monobankApi}/personal/statement/${cardId}/${dateStart}/${dateEnd}`;

        if (!cardId) return of({ error: 'Invalid token' });

        if (this.shouldSendQuery(this.monobankTransactionKey)) {
            return this.http.get<ITransaction[]>(transactionsApiUrl).pipe(
                catchError(() =>
                    of(this.getLocalStorageData(this.monobankTransactionKey))
                ),
                tap((transactions) =>
                    this.updateLocalStorage(
                        this.monobankTransactionKey,
                        transactions
                    )
                )
            );
        }

        return of(this.getLocalStorageData(this.monobankTransactionKey));
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
