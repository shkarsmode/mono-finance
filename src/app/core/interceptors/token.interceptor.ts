import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthService } from '@core/services/auth.service';


@Injectable({
    providedIn: 'root',
})
export class TokenInterceptor implements HttpInterceptor {
    constructor(private readonly authService: AuthService) {}

    public intercept(request: HttpRequest<any>, next: HttpHandler) {
        const token = this.authService.token;

        if (token) {
            request = request.clone({
                setHeaders: {
                    Authorization: `Bearer ${token}`,
                },
            });
        }

        return next.handle(request);
    }
}
