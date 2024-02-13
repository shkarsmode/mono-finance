import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MainPageComponent } from './main-page.component';
import { MainPageRoutingModule } from './main-page.routing';
import { HeaderWidgetModule, SidebarWidgetModule } from './widgets';

@NgModule({
    declarations: [MainPageComponent],
    imports: [
        CommonModule,
        MainPageRoutingModule,
        HeaderWidgetModule,
        SidebarWidgetModule,
    ],
})
export class MainPageModule {}
