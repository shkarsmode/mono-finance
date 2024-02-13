import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { HeaderUiComponent } from './ui';
import { HeaderWidgetComponent } from './view';

@NgModule({
    declarations: [HeaderWidgetComponent, HeaderUiComponent],
    imports: [CommonModule],
    exports: [
        HeaderWidgetComponent
    ]
})
export class HeaderWidgetModule {}
