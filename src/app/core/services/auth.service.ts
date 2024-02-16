import { Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { IAccountInfo } from '@core/interfaces';
import { BehaviorSubject, first } from 'rxjs';
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
    ) {}

    public processToken(token: string): void {
        // this.localStorageService.set(LocalStorage.MonobankToken, token);
        localStorage.setItem(LocalStorage.MonobankToken, token);
        this.monobankService
            .getClientInfo(true)
            .pipe(first())
            .subscribe((res) => this.authData$.next(res));
    }
}
