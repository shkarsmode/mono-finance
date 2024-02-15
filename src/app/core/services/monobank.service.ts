import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { IAccountInfo, ICurrency, ITransactions } from '@core/interfaces';
import { MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { Observable, catchError, of, tap } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

@Injectable({
    providedIn: 'root',
})
export class MonobankService {
    constructor(
        private readonly http: HttpClient,
        private readonly localStorageService: LocalStorageService,
        @Inject(MONOBANK_API) private readonly monobankApi: string
    ) {}

    private setLocalStorageData(
        key: LocalStorage,
        value: ICurrency[] | IAccountInfo | ITransactions[]
    ): void {
        this.localStorageService.set(key, value);
        const updatedAtObj: { [key: string]: number } =
            this.localStorageService.get(LocalStorage.UpdatedMonobankDataAt) ??
            {};

        updatedAtObj[key] = Date.now();

        this.localStorageService.set(
            LocalStorage.UpdatedMonobankDataAt,
            updatedAtObj
        );
    }

    private isCanSendQuery(key: LocalStorage): boolean {
        const updatedAtObj: { [key: string]: number } =
            this.localStorageService.get(LocalStorage.UpdatedMonobankDataAt); 

        return updatedAtObj[key] < Date.now() - 60000;
    }

    public getActualCurrency(): Observable<ICurrency[]> {
        if (this.isCanSendQuery(LocalStorage.MonobankCurrency))
            return this.http
                .get<ICurrency[]>(`${this.monobankApi}/bank/currency`)
                .pipe(
                    catchError((_) =>
                        of(
                            this.localStorageService.get(
                                LocalStorage.MonobankCurrency
                            ) as ICurrency[]
                        )
                    ),
                    tap((currency) =>
                        this.setLocalStorageData(
                            LocalStorage.MonobankCurrency,
                            currency
                        )
                    )
                );

        return of(
            this.localStorageService.get(
                LocalStorage.MonobankCurrency
            ) as ICurrency[]
        );
    }

    public getClientInfo(): Observable<IAccountInfo> {
        if (this.isCanSendQuery(LocalStorage.MonobankClientInfo))
            return this.http
                .get<IAccountInfo>(`${this.monobankApi}/personal/client-info`)
                .pipe(
                    tap((clientInfo: any) => clientInfo as IAccountInfo),
                    catchError((_) =>
                        of(
                            this.localStorageService.get(
                                LocalStorage.MonobankClientInfo
                            ) as IAccountInfo
                        )
                    ),
                    tap((clientInfo) =>
                        this.setLocalStorageData(
                            LocalStorage.MonobankClientInfo,
                            clientInfo
                        )
                    )
                );
        return of(
            this.localStorageService.get(
                LocalStorage.MonobankClientInfo
            ) as IAccountInfo
        );
    }

    public getTransactions(
        dateStart: number,
        dateEnd: number,
        cardId: string
    ): Observable<ITransactions[]> {
        if (this.isCanSendQuery(LocalStorage.MonobankTransactions))
            return this.http
                .get<ITransactions[]>(
                    `${this.monobankApi}/personal/statement/${cardId}/${dateStart}/${dateEnd}`
                )
                .pipe(
                    catchError((_) =>
                        of(
                            this.localStorageService.get(
                                LocalStorage.MonobankTransactions
                            ) as ITransactions[]
                        )
                    ),
                    tap((transactions) =>
                        this.setLocalStorageData(
                            LocalStorage.MonobankTransactions,
                            transactions
                        )
                    )
                );
        return of(
            this.localStorageService.get(
                LocalStorage.MonobankTransactions
            ) as ITransactions[]
        );
    }
}
