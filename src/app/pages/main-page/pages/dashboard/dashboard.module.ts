import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChartComponent, TransactionsComponent } from './components';
import { DashboardComponent } from './dashboard.component';
import { DashboardRoutingModule } from './dashboard.routing';


@NgModule({
    declarations: [DashboardComponent, TransactionsComponent, ChartComponent],
    imports: [CommonModule, DashboardRoutingModule, AngularSvgIconModule],
})
export class DashboardModule {}
