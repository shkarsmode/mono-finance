import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LocalStorage } from '@core/enums';


@Injectable({
    providedIn: 'root'
})
export class TokenInterceptor implements HttpInterceptor {
    public intercept(request: HttpRequest<any>, next: HttpHandler) {
        const token = localStorage.getItem(LocalStorage.MonobankToken);
        if (token) {
            request = request.clone({
                setHeaders: {
                    'X-Token': token,
                },
            });
        }

        return next.handle(request);
    }
}
