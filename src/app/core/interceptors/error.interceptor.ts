import {
    HttpHandler,
    HttpInterceptor,
    HttpRequest
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class ErrorInterceptor implements HttpInterceptor {
    constructor(
        private readonly router: Router,
        private readonly snackBar: MatSnackBar,
    ) {}

    public intercept(
        request: HttpRequest<any>,
        next: HttpHandler
    ) {
        return next.handle(request).pipe(
            catchError((error: any) => {
                if (error.error.statusCode === 401) {
                    this.router.navigateByUrl('/login');
                    this.snackBar.open(
                        `You have to authorize`,
                        '👀',
                        { duration: 6000 }
                    );
                    return throwError(() => new Error('401'));
                }

                const params = this.removeBasePathUrl(error.url);
                const { errorDescription } = error.error;

                this.snackBar.open(
                    `Url ${params}\n ${errorDescription}`,
                    '👀',
                    { duration: 6000 }
                );

                return throwError(() => new Error(error.error));
            })
        );
    }

    private removeBasePathUrl(url: string): string {
        return url.replace('https://api.monobank.ua', '');
    }
}
