import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';

@Component({
    selector: 'app-sidebar-groups-ui',
    templateUrl: './sidebar-groups-ui.component.html',
    styleUrl: './sidebar-groups-ui.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarGroupsUiComponent {
    @Input() groups: ICategoryGroup[] | null;
}