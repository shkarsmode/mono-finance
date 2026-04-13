import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';
import { CurrencyDisplayService } from '@core/services';

@Component({
    selector: 'app-sidebar-groups-ui',
    templateUrl: './sidebar-groups-ui.component.html',
    styleUrl: './sidebar-groups-ui.component.scss',
    // changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarGroupsUiComponent {
    @Input() groups: ICategoryGroup[] | null;
    readonly currencyDisplay = inject(CurrencyDisplayService);

    @Output() openGroup: EventEmitter<void> = new EventEmitter();
    @Output() changeOrdering: EventEmitter<ICategoryGroup[]> =
        new EventEmitter();
    @Output() editGroup: EventEmitter<ICategoryGroup> = new EventEmitter();

    public open(): void {
        this.openGroup.emit();
    }

    public onRightClick(group: ICategoryGroup): boolean {
        this.editGroup.emit(group);
        return false;
    }

    public dragAndDrop(event: CdkDragDrop<ICategoryGroup[]>) {
        if (!this.groups) return;

        moveItemInArray(
            this.groups ?? [],
            event.previousIndex,
            event.currentIndex
        );

        this.changeOrdering.emit(this.groups);
    }

    public onDoubleGroupClick(groupToDelete: ICategoryGroup): void {
        this.groups =
            this.groups?.filter(
                (group) => group.title !== groupToDelete.title
            ) ?? [];
        this.changeOrdering.emit(this.groups);
    }
}
