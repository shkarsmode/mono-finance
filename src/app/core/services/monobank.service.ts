import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AppRouteEnum, LocalStorage } from '@core/enums';
import { IAccountInfo, ICategoryGroup, ICurrency, ITransaction } from '@core/interfaces';
import { BASE_PATH_API, MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, catchError, first, map, mergeMap, Observable, of, retryWhen, scan, switchMap, tap, timer } from 'rxjs';
import { LoadingService } from './loading.service';
import { LocalStorageService } from './local-storage.service';

type TransactionResponseMeta = {
    cacheHit?: boolean;
    dataSource?: 'cache' | 'monobank';
    syncMode?: 'fresh-cache' | 'live' | 'cache-fallback';
    isUpToDate?: boolean;
    monobankResponded?: boolean;
    retryAfterSec?: number;
    nextAllowedAt?: number;
    [key: string]: unknown;
};

type TransactionSyncResponse = {
    synced: number;
    total: number;
    status: number;
    message: string;
    meta?: TransactionResponseMeta;
};

type TransactionsApiResponse = {
    data: ITransaction[];
    status: number;
    message: string;
    meta?: TransactionResponseMeta;
    syncMeta?: TransactionResponseMeta;
};

type TransactionsRequestOptions = {
    forceSync?: boolean;
    includeHold?: boolean;
    silent?: boolean;
};

type SyncTransactionsRequestOptions = {
    silent?: boolean;
};

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
    public activeYear: number = new Date().getFullYear();

    public readonly loadingService: LoadingService = inject(LoadingService);

    private readonly _rateLimitCooldown$ = new BehaviorSubject<number>(0);
    public readonly rateLimitCooldown$ = this._rateLimitCooldown$.asObservable();

    constructor(
        private readonly router: Router,
        private readonly http: HttpClient,
        private readonly localStorageService: LocalStorageService,
        private readonly snackBar: MatSnackBar,
        @Inject(MONOBANK_API) private readonly monobankApi: string,
        @Inject(BASE_PATH_API) private readonly basePathApi: string
    ) { }

    private startCooldown(seconds: number) {
        this._rateLimitCooldown$.next(seconds);
        if (seconds <= 0) return;
        const interval = setInterval(() => {
            const cur = this._rateLimitCooldown$.value;
            const next = Math.max(0, cur - 1);
            this._rateLimitCooldown$.next(next);
            if (next === 0) clearInterval(interval);
        }, 1000);
    }

    private parseRetryAfterSec(err: any): number {
        // 1) HTTP заголовок Retry-After (число секунд или дата — дату игнорим)
        let headerVal: any = undefined;
        try {
            headerVal = err?.headers?.get?.('Retry-After') ?? err?.headers?.['Retry-After'];
        } catch { /* ignore */ }
    
        const asNum = Number(headerVal);
        if (Number.isFinite(asNum) && asNum > 0) return asNum;
    
        // 2) Тело ошибки может содержать разные поля
        const candidates = [
            err?.error?.retryAfter,
            err?.error?.retry_after,
            err?.error?.retryAfterSec,
            err?.error?.retry_after_sec,
            err?.retryAfter,
            err?.retry_after,
        ].map(Number).filter(x => Number.isFinite(x) && x > 0);
    
        if (candidates.length) return candidates[0];
    
        // 3) Попробуем выдрать число из текста
        const msg = String(
            err?.error?.message ?? err?.message ?? ''
        );
        // e.g. "Too many requests to monobank api (2025 / 8)"
        // тут нет секунд — падаем на дефолт
        const numInMsg = msg.match(/\b(\d{1,5})\s*(?:sec|seconds|s)\b/i);
        if (numInMsg) {
            const n = Number(numInMsg[1]);
            if (Number.isFinite(n) && n > 0) return n;
        }
    
        // 4) дефолтный кулдаун
        return 60;
    }

    public parseRetryAfterFromError(err: any): number {
        return this.parseRetryAfterSec(err);
    }
    
    private isTooMany(err: HttpErrorResponse): boolean {
        const msg = (err?.error?.message ?? err?.message ?? '').toString().toLowerCase();
        return err?.status === 429 || msg.includes('too many');
    }
    
    public getTransactionsWithRetry(
        month: number,
        year: number,
        options?: TransactionsRequestOptions
    ): Observable<TransactionsApiResponse> {
        return this.getTransactions(month, year, options).pipe(
            retryWhen(errors =>
                errors.pipe(
                    scan((state, err: HttpErrorResponse) => {
                        console.log(err);
                        if (!this.isTooMany(err)) {
                            // не 429 — пробрасываем
                            throw err;
                        }
                        if (state.attempts >= 5) {
                            // исчерпали лимит ретраев
                            throw err;
                        }
                        const waitSec = this.parseRetryAfterSec(err);
                        return { attempts: state.attempts + 1, waitSec };
                    }, { attempts: 0, waitSec: 0 } as { attempts: number; waitSec: number }),
                    tap(({ waitSec }) => this.startCooldown(waitSec)),
                    mergeMap(({ waitSec }) => timer(waitSec * 1000))
                )
            )
        );
    }
    
    public mergeTransactions(incoming: ITransaction[]): void {
        if (!incoming?.length) return;
        const byId = new Map<string, ITransaction>();
        for (const t of this.currentTransactions$.value) byId.set(t.id, t);
        for (const t of incoming) byId.set(t.id, t);
        this.currentTransactions$.next(Array.from(byId.values()));
    }

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
        if (!clientInfo?.accounts) return;
        clientInfo.accounts?.forEach((account, index) => {
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

    public syncClientInfo(): Observable<IAccountInfo | any> {
        return this.getClientInfo(true);
    }

    public getClientInfo(forceSync: boolean = false): Observable<IAccountInfo | any> {
        const clientInfoApiUrl = forceSync
            ? `${this.basePathApi}/users/my/sync`
            : `${this.basePathApi}/users/my`;
        const request$ = forceSync
            ? this.http.post<IAccountInfo>(clientInfoApiUrl, {})
            : this.http.get<IAccountInfo>(clientInfoApiUrl);

        return request$.pipe(
            tap((clientInfo) => {
                // console.log('clientInfo', clientInfo);
                this.clientInfo$.next(clientInfo);

                this.categoryGroups$.next(clientInfo.categoryGroups ?? []);
                const activeCardId = localStorage.getItem(
                    LocalStorage.MonobankActiveCardId
                );
                if (!activeCardId) {
                    // console.log(clientInfo)
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

    public getTransactions(
        month: number,
        year?: number,
        options?: TransactionsRequestOptions
    ): Observable<TransactionsApiResponse> {
        if (!options?.silent) {
            this.loadingService.loading$.next(true);
        }
        const cardId = localStorage.getItem(LocalStorage.MonobankActiveCardId);
        const tz = -new Date().getTimezoneOffset(); // e.g. 120 for UTC+2
        let transactionsApiUrl = `${this.basePathApi}/transaction/${cardId}/${month}`;
        if (year) {
            transactionsApiUrl += `/${+year}`;
        }
        transactionsApiUrl += `?tz=${tz}`;
        if (options?.includeHold) {
            transactionsApiUrl += `&includeHold=true`;
        }

        let syncApiUrl = `${this.basePathApi}/transaction/sync/${cardId}?month=${month}&tz=${tz}`;
        if (year) {
            syncApiUrl += `&year=${+year}`;
        }

        const request$ = options?.forceSync
            ? this.http.post<TransactionSyncResponse>(syncApiUrl, {}).pipe(
                switchMap((syncResult) =>
                    this.http.get<TransactionsApiResponse>(transactionsApiUrl).pipe(
                        map(result => ({
                            ...result,
                            syncMeta: syncResult.meta,
                        }))
                    )
                )
            )
            : this.http.get<TransactionsApiResponse>(
                transactionsApiUrl
            );

        return request$
            .pipe(
                tap(({ data, status, message }) => {
                    if (!options?.silent) {
                        this.snackBar.open(message, '✅', {
                            duration: 5000,
                            horizontalPosition: 'right',
                            verticalPosition: 'top',
                            panelClass: ['green-snackbar'],
                        });
                    }
                    this.currentTransactions$.next(
                        this.removeDuplicatedTransactionsById(data)
                    )
                }),
                tap(() => {
                    if (!options?.silent) {
                        this.loadingService.loading$.next(false);
                    }
                })
            );
    }

    public syncTransactionsMonth(
        month: number,
        year?: number,
        options?: SyncTransactionsRequestOptions,
    ): Observable<TransactionSyncResponse> {
        if (!options?.silent) {
            this.loadingService.loading$.next(true);
        }

        const cardId = localStorage.getItem(LocalStorage.MonobankActiveCardId);
        const tz = -new Date().getTimezoneOffset();
        let syncApiUrl = `${this.basePathApi}/transaction/sync/${cardId}?month=${month}&tz=${tz}`;
        if (year) {
            syncApiUrl += `&year=${+year}`;
        }

        return this.http.post<TransactionSyncResponse>(syncApiUrl, {}).pipe(
            tap(({ message }) => {
                if (!options?.silent) {
                    this.snackBar.open(message, '✅', {
                        duration: 5000,
                        horizontalPosition: 'right',
                        verticalPosition: 'top',
                        panelClass: ['green-snackbar'],
                    });
                }
            }),
            tap(() => {
                if (!options?.silent) {
                    this.loadingService.loading$.next(false);
                }
            }),
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
