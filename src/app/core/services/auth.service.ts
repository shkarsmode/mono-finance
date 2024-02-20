import { Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { IAccountInfo } from '@core/interfaces';
import { BehaviorSubject, first, tap } from 'rxjs';
import { LocalStorageService } from './local-storage.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    public readonly authData$: BehaviorSubject<
        IAccountInfo | { error: string } | any
    > = new BehaviorSubject(null);

    

    constructor(
        private readonly localStorageService: LocalStorageService,
        private readonly monobankService: MonobankService
    ) { }

    public processToken(token: string): void {
        this.localStorageService.set(LocalStorage.MonobankToken, token);
        this.monobankService
            .testAuthenticationAccess()
            .pipe(
                first(),
                tap((clientInfo: IAccountInfo | { error: string }) => {
                    this.localStorageService.set(
                        LocalStorage.MonobankClientInfo,
                        clientInfo
                    );
                    
                    if ('error' in clientInfo) return;
                    
                    this.setDefaultCardBasedOnAmount(clientInfo);
                })
            )
            .subscribe((res) => this.authData$.next(res));
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
        this.monobankService.activeCardId$.next(activeCardId);

        this.localStorageService.set(
            LocalStorage.MonobankActiveCardId,
            activeCardId
        );
    }
}