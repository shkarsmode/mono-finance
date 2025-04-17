import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { JWT_OPTIONS, JwtHelperService } from '@auth0/angular-jwt';
import { ErrorInterceptor } from '@core/interceptors/error.interceptor';
import { TokenInterceptor } from '@core/interceptors/token.interceptor';
import { BASE_PATH_API, MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { environment } from '../environments';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app.routing';

import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingService } from '@core/services/loading.service';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        AngularSvgIconModule.forRoot(),
        HttpClientModule,
        MatSnackBarModule,
        MatProgressBarModule,
    ],
    providers: [
        JwtHelperService,
        LoadingService,
        { provide: JWT_OPTIONS, useValue: JWT_OPTIONS },
        {
            provide: MONOBANK_API,
            useValue: environment.monobankApi,
        },
        {
            provide: BASE_PATH_API,
            useValue: environment.basePathApi,
        },
        {
            provide: HTTP_INTERCEPTORS,
            useClass: TokenInterceptor,
            multi: true,
        },
        {
            provide: HTTP_INTERCEPTORS,
            useClass: ErrorInterceptor,
            multi: true,
        },
        provideAnimationsAsync(),
    ],
    bootstrap: [AppComponent],
})
export class AppModule {}
