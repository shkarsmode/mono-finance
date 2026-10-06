import {
    HttpErrorResponse,
    HttpHandler,
    HttpInterceptor,
    HttpRequest
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ToastService } from '@shared/components';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LoadingService } from '@core/services/loading.service';
import { catchError, throwError } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class ErrorInterceptor implements HttpInterceptor {
    public readonly loadingService: LoadingService = inject(LoadingService);

    constructor(
        private readonly router: Router,
        private readonly toast: ToastService,
        private readonly authService: AuthService
    ) {}

    public intercept(request: HttpRequest<any>, next: HttpHandler) {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                this.loadingService.loading$.next(false);

                // Let auth pages handle their own errors — and always re-throw the
                // original HttpErrorResponse so downstream status/Retry-After handling works.
                if (request.url.includes('/auth/')) {
                    return throwError(() => error);
                }

                // 401 → session is gone. Branch on the transport status, not on a
                // body field (custom error bodies may not carry statusCode).
                if (error.status === 401) {
                    this.authService.logout();
                    this.router.navigateByUrl('/login');
                    this.toast.error('Сесія завершилася — увійдіть знову.');
                    return throwError(() => error);
                }

                // 429 is a normal, expected rate-limit signal handled by callers
                // (cooldown timers / reschedule). Do not surface it as an error toast.
                if (error.status !== 429) {
                    const params = this.removeBasePathUrl(error.url ?? '');
                    // Angular's own error.message is always set and always English
                    // ("Http failure response for …"), so it would hide the fallback;
                    // the status code keeps the diagnostic part of it.
                    const description =
                        error.error?.message ??
                        error.error?.errorDescription ??
                        (error.status ? `Запит не вдався (${error.status})` : 'Запит не вдався');
                    this.toast.error(`${description} · ${params}`);
                }

                // Preserve the HttpErrorResponse so status, headers (Retry-After) and
                // body survive for whoever catches it.
                return throwError(() => error);
            })
        );
    }

    private removeBasePathUrl(url: string): string {
        return url.replace('https://api.monobank.ua', '');
    }
}
