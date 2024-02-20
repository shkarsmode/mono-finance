import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
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
        private readonly monobankService: MonobankService,
        private readonly dialog: MatDialog,
        private cdr: ChangeDetectorRef
    ) {}

    public ngOnInit(): void {
        this.initCategoryGroupsData();
    }

    public initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.categoryGroups$;
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
        if (!group) return;

        this.categoryGroupService.set(group);
    }

    private get transactionsDescriptionArray(): Array<string> {
        const transactions: ITransaction[] = this.localStorageService.get(
            this.monobankService.monobankTransactionKey
        );

        return Array.from(new Set(transactions.map(transaction => transaction.description)));
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
