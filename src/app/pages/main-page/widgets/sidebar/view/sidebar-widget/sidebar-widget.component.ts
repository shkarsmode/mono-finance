import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { Observable, Subject, firstValueFrom, takeUntil } from 'rxjs';
import { LocalStorageService } from '../../../../../../core/services/local-storage.service';
import { DialogAddCategoryComponent } from '../../modals';
@Component({
    selector: 'app-sidebar-widget',
    templateUrl: './sidebar-widget.component.html',
    styleUrl: './sidebar-widget.component.scss',
    // changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarWidgetComponent implements OnInit, OnDestroy {
    public groups$: Observable<ICategoryGroup[]>;
    public currentTransactions$: Observable<ITransaction[]>;

    private destroy$: Subject<void> = new Subject();

    constructor(
        private readonly categoryGroupService: CategoryGroupService,
        private readonly localStorageService: LocalStorageService,
        private readonly monobankService: MonobankService,
        private readonly dialog: MatDialog,
        private cdr: ChangeDetectorRef
    ) {}

    public ngOnInit(): void {
        this.initCurrentTransactions();
        this.initCategoryGroupsData();
    }

    private initCurrentTransactions(): void {
        this.currentTransactions$ = this.monobankService.currentTransactions$.asObservable();
    }

    public changeGroupsOrdering(groups: ICategoryGroup[]): void {
        this.categoryGroupService.changeOrdering(groups);
    }

    public initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.categoryGroups$;
    }

    public onEditGroup(group: ICategoryGroup): void {
        this.openModalToAddCategory(group);
    }

    public async openModalToAddCategory(
        editGroupData?: { keys: string[], emoji: string, title: string }
    ): Promise<void> {
        const transactionsDescriptionArray =
            await this.getTransactionsDescriptionArray();

        this.dialog
            .open(DialogAddCategoryComponent, {
                data: {
                    transactions: transactionsDescriptionArray,
                    editGroupData,
                },
            })
            .afterClosed()
            .pipe(takeUntil(this.destroy$))
            .subscribe(this.handleAfterCloseModal.bind(this));
    }

    private handleAfterCloseModal(group: ICategoryGroup): void {
        console.log(group);
        if (!group) return;

        this.categoryGroupService.set(group);
    }

    private async getTransactionsDescriptionArray(): Promise<Array<string>> {
        const transactions: ITransaction[] = await firstValueFrom(this.currentTransactions$);

        return Array.from(
            new Set(transactions.map((transaction) => transaction.description))
        );
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
