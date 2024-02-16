import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SidebarGroupsUiComponent, SidebarUiComponent } from './ui';
import { SidebarWidgetComponent } from './view';

@NgModule({
    declarations: [SidebarWidgetComponent, SidebarUiComponent, SidebarGroupsUiComponent],
    imports: [CommonModule, AngularSvgIconModule, RouterModule],
    exports: [SidebarWidgetComponent],
})
export class SidebarWidgetModule {}
