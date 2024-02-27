import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';

@Component({
    selector: 'app-sidebar-groups-ui',
    templateUrl: './sidebar-groups-ui.component.html',
    styleUrl: './sidebar-groups-ui.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarGroupsUiComponent {
    @Input() groups: ICategoryGroup[] | null;
    @Output() openGroup: EventEmitter<void> = new EventEmitter();
    @Output() changeOrdering: EventEmitter<ICategoryGroup[]> =
        new EventEmitter();

    public open(): void {
        this.openGroup.emit();
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
        this.groups = this.groups?.filter((group) => group.title !== groupToDelete.title) ?? [];
        this.changeOrdering.emit(this.groups);
    }
}
