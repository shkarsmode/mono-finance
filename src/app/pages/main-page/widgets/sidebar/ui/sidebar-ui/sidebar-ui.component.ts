import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';

@Component({
    selector: 'app-sidebar-ui',
    templateUrl: './sidebar-ui.component.html',
    styleUrl: './sidebar-ui.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class SidebarUiComponent {
    @Input() groups: ICategoryGroup[] | null;
}
