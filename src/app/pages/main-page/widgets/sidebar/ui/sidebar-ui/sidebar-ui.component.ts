import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';

@Component({
    selector: 'app-sidebar-ui',
    templateUrl: './sidebar-ui.component.html',
    styleUrl: './sidebar-ui.component.scss',
    // changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class SidebarUiComponent {
    @Input() groups: ICategoryGroup[] | null;

    @Output() openModal: EventEmitter<void> = new EventEmitter();
    @Output() editGroup: EventEmitter<ICategoryGroup> = new EventEmitter();
    @Output() changeGroupsOrdering: EventEmitter<ICategoryGroup[]> = new EventEmitter();

    public openGroup = () => 
        this.openModal.emit();

    public onEditGroup = (group: ICategoryGroup) => 
        this.editGroup.emit(group);

    public onChangeGroupsOrdering = (groups: ICategoryGroup[]) => 
        this.changeGroupsOrdering.emit(groups)
    
}
