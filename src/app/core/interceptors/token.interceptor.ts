import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { LocalStorageService } from '@core/services';


@Injectable({
    providedIn: 'root'
})
export class TokenInterceptor implements HttpInterceptor {
    private token: string | null;
    private localStorageService = inject(LocalStorageService)
    constructor() {
        this.token = localStorage.getItem(LocalStorage.MonobankToken);
    }

    intercept(request: HttpRequest<any>, next: HttpHandler) {

        if (this.token) {
            request = request.clone({
                setHeaders: {
                    'X-Token': this.token,
                },
            });
        }

        return next.handle(request);
    }
}
