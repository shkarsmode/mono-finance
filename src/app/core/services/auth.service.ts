import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { JwtHelperService } from '@auth0/angular-jwt';
import { IAccountInfo } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { LocalStorageService } from './local-storage.service';
import { MonobankService } from './monobank.service';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    public readonly authData$: BehaviorSubject<
        IAccountInfo | { error: string } | any
    > = new BehaviorSubject(null);

    private isAuthenticatedSubject: BehaviorSubject<boolean> =
        new BehaviorSubject<boolean>(false);

    public isAuthenticated$: Observable<boolean> =
        this.isAuthenticatedSubject.asObservable();
    public userId: number | null;

    constructor(
        private readonly http: HttpClient,
        private readonly jwt: JwtHelperService,
        private readonly monobankService: MonobankService,
        private readonly localStorageService: LocalStorageService,
        @Inject(BASE_PATH_API) private basePathAPI: string
    ) {
        this.checkTokenExpiration();
        this.initializeAuth();
    }

    // public registerWithAMail(
    //     email: string,
    //     userName: string,
    //     password: string,
    //     confirmPassword: string
    // ): Observable<RegisterResponseDto> {
    //     return this.http.post<RegisterResponseDto>(
    //         `${this.authPathApi}/register`,
    //         {
    //             email,
    //             userName,
    //             password,
    //             confirmPassword
    //         }).pipe(tap((response: any) => {
    //             this.login(response.token);
    //             return response;
    //         }));
    // }


    public loginWithAMail(email: string, password: string): Observable<any> {
        return this.http
            .post<any>(`${this.basePathAPI}/auth/login`, {
                email: email,
                password,
            })
            .pipe(
                tap((response: any) => {
                    this.login(response.token);
                    return response;
                })
            );
    }

    public login(
        userAuthData: { email: string, password: string }
    ): Observable<{ token: string }> {
        return this.http.post<{ token: string }>(
            `${this.basePathAPI}/auth/login`,
            userAuthData
        ).pipe(
            tap((response) => this.setToken(response.token))
        )
    }

    public setToken(token: string): void {
        localStorage.setItem('token', token);
        const id = this.getUserIdFromToken(token);

        if (id) this.userId = id;

        this.isAuthenticatedSubject.next(true);
        this.checkTokenExpiration();
    }

    // public registration(body: any): Observable<any> {
    //     return this.http.post(`${this.authPathApi}/registration`, body);
    // }

    public getUserIdFromToken(token: string): number | null {
        try {
            const decodedToken = this.jwt.decodeToken(token);
            const id = decodedToken?.id;
            if (id) return id;

            return null;
        } catch (e) {
            return null;
        }
    }

    public logout(): void {
        localStorage.removeItem('token');
        this.userId = null;
        this.isAuthenticatedSubject.next(false);
    }

    private checkTokenExpiration(): void {
        const token = localStorage.getItem('token') as string;
        let isTokenExpired;

        try {
            isTokenExpired = !!token
                ? this.jwt.isTokenExpired(token)
                : true;
        } catch (err) {
            // this.errorNotificationService.show('Forged token');
            this.logout();
            return;
        }

        if (isTokenExpired) {
            this.logout();
        }
    }

    private initializeAuth(): void {
        const token = localStorage.getItem('token');
        const isAuthenticated = !!token && !this.jwt.isTokenExpired(token);
        this.isAuthenticatedSubject.next(isAuthenticated);
    }

    public get token(): string | null {
        const token = localStorage.getItem('token');
        return token;
    }

    // public processToken(token: string): void {
    //     this.localStorageService.set(LocalStorage.MonobankToken, token);
    //     this.monobankService
    //         .testAuthenticationAccess()
    //         .pipe(
    //             first(),
    //             tap((clientInfo: IAccountInfo | { error: string }) => {
    //                 this.localStorageService.set(
    //                     LocalStorage.MonobankClientInfo,
    //                     clientInfo
    //                 );

    //                 if ('error' in clientInfo) return;

    //                 this.setDefaultCardBasedOnAmount(clientInfo);
    //             })
    //         )
    //         .subscribe((res) => this.authData$.next(res));
    // }
}