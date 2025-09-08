import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MccAnalyticsComponent } from '../../features/analytics-mcc';
import { SharedModule } from '../../shared/shared.module';
import { MainPageComponent } from './main-page.component';
import { MainPageRoutingModule } from './main-page.routing';
import { HeaderWidgetModule, SidebarWidgetModule } from './widgets';

@NgModule({
    declarations: [MainPageComponent, MccAnalyticsComponent],
    imports: [
        CommonModule,
        MainPageRoutingModule,
        HeaderWidgetModule,
        SidebarWidgetModule,
        SharedModule
    ],
})
export class MainPageModule {}
