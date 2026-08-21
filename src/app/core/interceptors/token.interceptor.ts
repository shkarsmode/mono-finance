import { HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { AuthService } from '@core/services/auth.service';


@Injectable({
    providedIn: 'root',
})
export class TokenInterceptor implements HttpInterceptor {
    constructor(
        private readonly authService: AuthService,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
    ) {}

    public intercept(request: HttpRequest<any>, next: HttpHandler) {
        const token = this.authService.token;

        // Only ever attach our app JWT to our own API. Never leak it to a third
        // party (e.g. api.monobank.ua), which would happen for any absolute URL.
        if (token && request.url.startsWith(this.basePathApi)) {
            request = request.clone({
                setHeaders: {
                    Authorization: `Bearer ${token}`,
                },
            });
        }

        return next.handle(request);
    }
}
