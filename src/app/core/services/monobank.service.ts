import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AppRouteEnum, LocalStorage } from '@core/enums';
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
        private readonly router: Router,
        @Inject(MONOBANK_API) private readonly monobankApi: string
    ) {}

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

    public getClientInfo(): Observable<IAccountInfo | any> {
        if (this.isCanSendQuery(LocalStorage.MonobankClientInfo))
            return this.http
                .get<IAccountInfo>(`${this.monobankApi}/personal/client-info`)
                .pipe(
                    catchError((error) => {
                        const clientInfo = this.localStorageService.get(
                            LocalStorage.MonobankClientInfo
                        ) as IAccountInfo;

                        if (!clientInfo) {
                            // this.localStorageService.remove(LocalStorage.MonobankToken);
                            return of({ error: 'Invalid token' })
                        }

                        this.setLocalStorageData(
                            LocalStorage.MonobankClientInfo,
                            clientInfo
                        );
                        return of(clientInfo);
                    })
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
        console.log(updatedAtObj);
        if (!updatedAtObj[key]) {
            this.router.navigateByUrl(AppRouteEnum.Login);
            console.error('You have to authorize');
            return true;
        }

        return updatedAtObj[key] < Date.now() - 60000;
    }
}
