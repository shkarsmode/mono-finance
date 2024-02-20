import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MaskedCardPipe } from '../../pipes';
import { CardComponent, ChartComponent, TransactionsComponent } from './components';
import { DashboardComponent } from './dashboard.component';
import { DashboardRoutingModule } from './dashboard.routing';


@NgModule({
    declarations: [
        DashboardComponent,
        TransactionsComponent,
        ChartComponent,
        CardComponent,
        MaskedCardPipe,
    ],
    imports: [
        CommonModule,
        DashboardRoutingModule,
        AngularSvgIconModule,
        MatProgressSpinnerModule,
    ],
})
export class DashboardModule {}
