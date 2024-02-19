import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { TokenInterceptor } from '@core/interceptors/token.interceptor';
import { MONOBANK_API } from '@core/tokens/monobank-environment.tokens';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { environment } from '../environments';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app.routing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        AngularSvgIconModule.forRoot(),
        HttpClientModule,
    ],
    providers: [
        {
            provide: MONOBANK_API,
            useValue: environment.monobankApi,
        },
        {
            provide: HTTP_INTERCEPTORS,
            useClass: TokenInterceptor,
            multi: true
        },
        provideAnimationsAsync(),
    ],
    bootstrap: [AppComponent],
})
export class AppModule {}
