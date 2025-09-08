import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { MatBadgeModule } from '@angular/material/badge';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SharedModule } from '../../../../shared/shared.module';
import { MaskedCardPipe } from '../../pipes';
import { CardComponent, TransactionsComponent } from './components';
import { DashboardComponent } from './dashboard.component';
import { DashboardRoutingModule } from './dashboard.routing';


@NgModule({
    declarations: [
        DashboardComponent,
        TransactionsComponent,
        CardComponent,
        MaskedCardPipe,
    ],
    imports: [
        CommonModule,
        DashboardRoutingModule,
        AngularSvgIconModule,
        MatProgressSpinnerModule,
        SharedModule,
        MatSelectModule,
        MatCheckboxModule,
        MatTooltipModule,
        MatBadgeModule,
        SharedModule
    ],
})
export class DashboardModule {}
