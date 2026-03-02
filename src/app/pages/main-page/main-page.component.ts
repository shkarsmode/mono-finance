import { AsyncPipe } from '@angular/common';
import {
    ChangeDetectionStrategy, Component,
    OnInit, ViewContainerRef, computed,
    inject, signal
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LocalStorage } from '@core/enums';
import { LoadingService } from '@core/services/loading.service';
import { MonobankService } from '@core/services/monobank.service';
import { ThemeService } from '@core/services/theme.service';
import { ToastService } from '@shared/components';
import { first } from 'rxjs';

@Component({
    selector: 'app-main-page',
    standalone: true,
    imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
    templateUrl: './main-page.component.html',
    styleUrl: './main-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainPageComponent implements OnInit {
    private readonly monobankService = inject(MonobankService);
    public readonly loadingService = inject(LoadingService);
    private readonly toastService = inject(ToastService);
    public readonly themeService = inject(ThemeService);
    private readonly viewContainerRef = inject(ViewContainerRef);

    readonly sidenavOpen = signal(false);
    readonly isSyncing = signal(false);
    readonly isDark = computed(() => this.themeService.theme() === 'dark');

    readonly navItems = [
        { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
        { path: '/exchange', icon: 'currency_exchange', label: 'Exchange' },
        { path: '/subscriptions', icon: 'autorenew', label: 'Subscriptions' },
        { path: '/analytics/mcc', icon: 'analytics', label: 'Analytics' },
        { path: '/profile', icon: 'person', label: 'Profile' },
    ];

    ngOnInit(): void {
        this.toastService.init(this.viewContainerRef);
        this.initClientInfoData();
        this.initTransactionsData();

        // Restore persisted UI preferences
        if (localStorage.getItem('finance-blur-balance') === 'true') {
            document.documentElement.classList.add('balance-blurred');
        }
        if (localStorage.getItem('finance-compact') === 'true') {
            document.documentElement.classList.add('compact-mode');
        }
    }

    toggleSidenav(): void {
        this.sidenavOpen.update(v => !v);
    }

    closeSidenav(): void {
        this.sidenavOpen.set(false);
    }

    toggleTheme(): void {
        this.themeService.toggle();
    }

    syncData(): void {
        if (this.isSyncing()) return;
        this.isSyncing.set(true);
        this.monobankService.getClientInfo().pipe(first()).subscribe({
            next: () => {
                this.monobankService.getTransactions(
                    this.monobankService.activeMonth,
                    this.monobankService.activeYear,
                ).pipe(first()).subscribe({
                    next: () => {
                        this.isSyncing.set(false);
                        this.toastService.success('Data synced successfully');
                    },
                    error: () => {
                        this.isSyncing.set(false);
                        this.toastService.error('Failed to sync transactions');
                    },
                });
            },
            error: () => {
                this.isSyncing.set(false);
                this.toastService.error('Failed to sync account info');
            },
        });
    }

    private initClientInfoData(): void {
        this.monobankService.getClientInfo().pipe(first()).subscribe();
    }

    private initTransactionsData(): void {
        if (localStorage.getItem(LocalStorage.MonobankActiveCardId)) {
            this.monobankService
                .getTransactions(this.monobankService.activeMonth)
                .pipe(first())
                .subscribe();
        }
    }
}
