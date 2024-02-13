import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { IAccountInfo, ICurrency } from '@core/interfaces';
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

    public getActualCurrency(): Observable<ICurrency[]> {
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
                    this.localStorageService.set(
                        LocalStorage.MonobankCurrency,
                        currency
                    )
                )
            );
    }

    public getClientInfo(): Observable<IAccountInfo> {
        return this.http
            .get<IAccountInfo>(`${this.monobankApi}/personal/client-info`, {
            })
            .pipe(
                tap((clientInfo: any) => clientInfo as IAccountInfo)
                // catchError((_) =>
                //     of(
                //         this.localStorageService.get(
                //             LocalStorage.MonobankClientInfo
                //         ) as IAccountInfo
                //     )
                // ),
                // tap((clientInfo) =>
                //     this.localStorageService.set(
                //         LocalStorage.MonobankClientInfo,
                //         clientInfo
                //     )
                // )
            );
    }
}
