import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { LocalStorage } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService } from '@core/services';
import { Observable, Subject, takeUntil } from 'rxjs';
import { LocalStorageService } from '../../../../../../core/services/local-storage.service';
import { DialogAddCategoryComponent } from '../../modals';
@Component({
    selector: 'app-sidebar-widget',
    templateUrl: './sidebar-widget.component.html',
    styleUrl: './sidebar-widget.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarWidgetComponent implements OnInit, OnDestroy {
    public groups$: Observable<ICategoryGroup[]>;

    private destroy$: Subject<void> = new Subject();

    constructor(
        private readonly categoryGroupService: CategoryGroupService,
        private readonly localStorageService: LocalStorageService,
        private readonly dialog: MatDialog
    ) {}

    public ngOnInit(): void {
        this.initCategoryGroupsData();
    }

    public initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.get();
        this.groups$
            .pipe(takeUntil(this.destroy$))
            .subscribe((groups) => console.log('widget', groups));
    }

    public openModalToAddCategory(): void {
        const transactionsDescriptionArray = this.transactionsDescriptionArray;
        this.dialog
            .open(DialogAddCategoryComponent, {
                data: {
                    transactions: transactionsDescriptionArray,
                },
            })
            .afterClosed()
            .pipe(takeUntil(this.destroy$))
            .subscribe(this.handleAfterCloseModal.bind(this));
    }

    private handleAfterCloseModal(group: ICategoryGroup): void {
        console.log('group', group)
        if (!group) return;

        this.categoryGroupService.set(group);
    }

    private get transactionsDescriptionArray(): Array<string> {
        const transactions: ITransaction[] = 
            this.localStorageService.get(LocalStorage.MonobankTransactions);

        return Array.from(new Set(transactions.map(transaction => transaction.description)));
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
