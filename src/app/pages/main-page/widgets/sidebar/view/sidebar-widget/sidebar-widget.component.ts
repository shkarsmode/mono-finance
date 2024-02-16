import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ICategoryGroup } from '@core/interfaces';
import { CategoryGroupService } from '@core/services';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-sidebar-widget',
    templateUrl: './sidebar-widget.component.html',
    styleUrl: './sidebar-widget.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarWidgetComponent implements OnInit {
    public groups$: Observable<ICategoryGroup[]>;

    constructor(
        private readonly categoryGroupService: CategoryGroupService
    ) {}

    public ngOnInit(): void {
        this.initCategoryGroupsData();
    }

    public initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.get();
        this.groups$.subscribe(groups => console.log('widget', groups))
    }
}
