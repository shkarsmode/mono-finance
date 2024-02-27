import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { DialogAddCategoryComponent } from './modals';
import { SidebarGroupsUiComponent, SidebarUiComponent } from './ui';
import { SidebarWidgetComponent } from './view';

@NgModule({
    declarations: [
        SidebarWidgetComponent,
        SidebarUiComponent,
        SidebarGroupsUiComponent,
        DialogAddCategoryComponent,
    ],
    imports: [
        CommonModule,
        AngularSvgIconModule,
        RouterModule,
        MatDialogModule,
        MatSelectModule,
        MatAutocompleteModule,
        MatInputModule,
        MatIconModule,
        MatButtonModule,
        MatChipsModule,
        ReactiveFormsModule,
        MatTooltipModule,
        DragDropModule,
    ],
    exports: [SidebarWidgetComponent],
})
export class SidebarWidgetModule {}
