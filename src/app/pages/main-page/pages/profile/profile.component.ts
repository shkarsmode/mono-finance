import { AsyncPipe, DecimalPipe } from '@angular/common';
import {
    ChangeDetectionStrategy, Component, computed,
    DestroyRef, inject, OnInit, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IAccountInfo, ITransaction } from '@core/interfaces';
import { AuthService } from '@core/services/auth.service';
import { MonobankService } from '@core/services/monobank.service';
import { ThemeService } from '@core/services/theme.service';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [AsyncPipe, DecimalPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="profile-page">
            <header class="profile-header">
                <div class="avatar">
                    <span class="material-icons-round">person</span>
                </div>
                <h1 class="profile-name">{{ clientName() }}</h1>
                <p class="profile-sub">Monobank • Personal Finance</p>
            </header>

            <!-- Settings -->
            <section class="section">
                <h2 class="section__title">
                    <span class="material-icons-round">settings</span>
                    Settings
                </h2>

                <div class="settings-grid">
                    <!-- Theme -->
                    <div class="setting-card">
                        <div class="setting-card__icon">
                            <span class="material-icons-round">
                                {{ isDark() ? 'dark_mode' : 'light_mode' }}
                            </span>
                        </div>
                        <div class="setting-card__info">
                            <span class="setting-card__label">Theme</span>
                            <span class="setting-card__value">{{ isDark() ? 'Dark' : 'Light' }}</span>
                        </div>
                        <button class="toggle" [class.toggle--on]="isDark()" (click)="toggleTheme()">
                            <span class="toggle__knob"></span>
                        </button>
                    </div>

                    <!-- Balance blur -->
                    <div class="setting-card">
                        <div class="setting-card__icon">
                            <span class="material-icons-round">visibility_off</span>
                        </div>
                        <div class="setting-card__info">
                            <span class="setting-card__label">Blur Card Balance</span>
                            <span class="setting-card__value">
                                {{ balanceBlurred() ? 'Balances hidden' : 'Balances visible' }}
                            </span>
                        </div>
                        <button class="toggle" [class.toggle--on]="balanceBlurred()" (click)="toggleBalanceBlur()">
                            <span class="toggle__knob"></span>
                        </button>
                    </div>

                    <!-- Currency display -->
                    <div class="setting-card">
                        <div class="setting-card__icon">
                            <span class="material-icons-round">currency_exchange</span>
                        </div>
                        <div class="setting-card__info">
                            <span class="setting-card__label">Currency Display</span>
                            <span class="setting-card__value">UAH (Ukrainian Hryvnia)</span>
                        </div>
                    </div>

                    <!-- Compact mode -->
                    <div class="setting-card">
                        <div class="setting-card__icon">
                            <span class="material-icons-round">dashboard_customize</span>
                        </div>
                        <div class="setting-card__info">
                            <span class="setting-card__label">Compact Mode</span>
                            <span class="setting-card__value">
                                {{ compactMode() ? 'Enabled' : 'Disabled' }}
                            </span>
                        </div>
                        <button class="toggle" [class.toggle--on]="compactMode()" (click)="toggleCompactMode()">
                            <span class="toggle__knob"></span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- Statistics -->
            <section class="section">
                <h2 class="section__title">
                    <span class="material-icons-round">bar_chart</span>
                    Account Overview
                </h2>

                <div class="stats-grid">
                    <div class="stat-card stat-card--primary">
                        <span class="stat-card__icon material-icons-round">account_balance</span>
                        <div class="stat-card__info">
                            <span class="stat-card__value">{{ totalAccounts() }}</span>
                            <span class="stat-card__label">Accounts</span>
                        </div>
                    </div>
                    <div class="stat-card stat-card--success">
                        <span class="stat-card__icon material-icons-round">savings</span>
                        <div class="stat-card__info">
                            <span class="stat-card__value">{{ totalJars() }}</span>
                            <span class="stat-card__label">Jars</span>
                        </div>
                    </div>
                    <div class="stat-card stat-card--warn">
                        <span class="stat-card__icon material-icons-round">category</span>
                        <div class="stat-card__info">
                            <span class="stat-card__value">{{ totalCategories() }}</span>
                            <span class="stat-card__label">Categories</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__icon material-icons-round">receipt_long</span>
                        <div class="stat-card__info">
                            <span class="stat-card__value">{{ totalTransactions() }}</span>
                            <span class="stat-card__label">Transactions loaded</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Jars overview -->
            @if (jars().length) {
                <section class="section">
                    <h2 class="section__title">
                        <span class="material-icons-round">savings</span>
                        Your Jars
                    </h2>
                    <div class="jars-grid">
                        @for (jar of jars(); track jar.title) {
                            <div class="jar-card">
                                <div class="jar-card__header">
                                    <span class="jar-card__title">{{ jar.title }}</span>
                                    @if (jar.goal > 0) {
                                        <span class="jar-card__pct">
                                            {{ ((jar.balance / jar.goal) * 100) | number: '1.0-0' }}%
                                        </span>
                                    }
                                </div>
                                @if (jar.goal > 0) {
                                    <div class="jar-card__bar">
                                        <div class="jar-card__bar-fill"
                                             [style.width.%]="(jar.balance / jar.goal) * 100 | number: '1.0-0'">
                                        </div>
                                    </div>
                                }
                                <div class="jar-card__amounts">
                                    <span class="jar-card__balance">{{ jar.balance / 100 | number: '1.2-2' }}</span>
                                    @if (jar.goal > 0) {
                                        <span class="jar-card__goal">/ {{ jar.goal / 100 | number: '1.0-0' }}</span>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                </section>
            }

            <!-- Danger zone -->
            <section class="section section--danger">
                <h2 class="section__title">
                    <span class="material-icons-round">warning</span>
                    Account
                </h2>
                <button class="btn btn--danger" (click)="logout()">
                    <span class="material-icons-round">logout</span>
                    Sign out
                </button>
            </section>
        </div>
    `,
    styles: [`
        :host { display: block; }

        .profile-page {
            max-width: 720px;
            margin: 0 auto;
            padding-bottom: var(--space-8);
        }

        /* Header */
        .profile-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-6) 0;
        }

        .avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: var(--color-primary-subtle);
            display: flex;
            align-items: center;
            justify-content: center;
            .material-icons-round { font-size: 36px; color: var(--color-primary); }
        }

        .profile-name {
            font-size: var(--text-xl);
            font-weight: 700;
            color: var(--color-text-primary);
        }

        .profile-sub {
            font-size: var(--text-sm);
            color: var(--color-text-tertiary);
        }

        /* Sections */
        .section {
            margin-bottom: var(--space-6);
        }

        .section__title {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            font-size: var(--text-lg);
            font-weight: 600;
            color: var(--color-text-primary);
            margin-bottom: var(--space-4);
            .material-icons-round { font-size: 22px; color: var(--color-primary); }
        }

        /* Settings grid */
        .settings-grid {
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
        }

        .setting-card {
            display: flex;
            align-items: center;
            gap: var(--space-4);
            padding: var(--space-4);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            transition: border-color var(--duration-fast);
            &:hover { border-color: var(--color-primary); }
        }

        .setting-card__icon {
            width: 40px;
            height: 40px;
            border-radius: var(--radius-sm);
            background: var(--color-primary-subtle);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            .material-icons-round { font-size: 20px; color: var(--color-primary); }
        }

        .setting-card__info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .setting-card__label {
            font-size: var(--text-sm);
            font-weight: 600;
            color: var(--color-text-primary);
        }

        .setting-card__value {
            font-size: var(--text-xs);
            color: var(--color-text-tertiary);
        }

        /* Toggle */
        .toggle {
            width: 44px;
            height: 24px;
            border-radius: 12px;
            background: var(--color-surface-active);
            position: relative;
            cursor: pointer;
            transition: background var(--duration-fast);
            flex-shrink: 0;
        }

        .toggle--on {
            background: var(--color-primary);
        }

        .toggle__knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #fff;
            box-shadow: var(--shadow-1);
            transition: transform var(--duration-fast) var(--ease-default);
        }

        .toggle--on .toggle__knob {
            transform: translateX(20px);
        }

        /* Stats grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: var(--space-3);
        }

        .stat-card {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-4);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
        }

        .stat-card__icon {
            font-size: 24px;
            color: var(--color-text-tertiary);
        }

        .stat-card--primary .stat-card__icon { color: var(--color-primary); }
        .stat-card--success .stat-card__icon { color: var(--color-success); }
        .stat-card--warn .stat-card__icon { color: var(--color-warn); }

        .stat-card__info {
            display: flex;
            flex-direction: column;
        }

        .stat-card__value {
            font-size: var(--text-lg);
            font-weight: 700;
            color: var(--color-text-primary);
        }

        .stat-card__label {
            font-size: var(--text-xs);
            color: var(--color-text-tertiary);
        }

        /* Jars */
        .jars-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: var(--space-3);
        }

        .jar-card {
            padding: var(--space-4);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
        }

        .jar-card__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .jar-card__title {
            font-size: var(--text-sm);
            font-weight: 600;
            color: var(--color-text-primary);
        }

        .jar-card__pct {
            font-size: var(--text-xs);
            font-weight: 600;
            color: var(--color-primary);
        }

        .jar-card__bar {
            height: 6px;
            background: var(--color-surface-hover);
            border-radius: 3px;
            overflow: hidden;
        }

        .jar-card__bar-fill {
            height: 100%;
            background: var(--color-primary);
            border-radius: 3px;
            transition: width var(--duration-normal);
            min-width: 2px;
        }

        .jar-card__amounts {
            display: flex;
            gap: var(--space-1);
            align-items: baseline;
        }

        .jar-card__balance {
            font-size: var(--text-base);
            font-weight: 700;
            color: var(--color-text-primary);
        }

        .jar-card__goal {
            font-size: var(--text-xs);
            color: var(--color-text-tertiary);
        }

        /* Danger zone */
        .section--danger {
            padding-top: var(--space-5);
            border-top: 1px solid var(--color-border);
            .section__title .material-icons-round { color: var(--color-error); }
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            border-radius: var(--radius-sm);
            font-size: var(--text-sm);
            font-weight: 500;
            cursor: pointer;
            transition: all var(--duration-fast);
            .material-icons-round { font-size: 16px; }
        }

        .btn--danger {
            background: var(--color-error-subtle);
            color: var(--color-error);
            border: 1px solid transparent;
            &:hover {
                background: var(--color-error);
                color: #fff;
            }
        }

        @media (max-width: 767px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `],
})
export default class ProfileComponent implements OnInit {
    private readonly monobankService = inject(MonobankService);
    private readonly themeService = inject(ThemeService);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    readonly clientInfo = signal<IAccountInfo | null>(null);
    readonly transactions = signal<ITransaction[]>([]);
    readonly balanceBlurred = signal(localStorage.getItem('finance-blur-balance') === 'true');
    readonly compactMode = signal(localStorage.getItem('finance-compact') === 'true');
    readonly isDark = computed(() => this.themeService.theme() === 'dark');

    readonly clientName = computed(() => this.clientInfo()?.name ?? 'User');
    readonly totalAccounts = computed(() => this.clientInfo()?.accounts?.length ?? 0);
    readonly totalJars = computed(() => this.clientInfo()?.jars?.length ?? 0);
    readonly totalCategories = computed(() => this.clientInfo()?.categoryGroups?.length ?? 0);
    readonly totalTransactions = computed(() => this.transactions().length);
    readonly jars = computed(() => this.clientInfo()?.jars ?? []);

    ngOnInit(): void {
        this.monobankService.clientInfo$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(info => this.clientInfo.set(info));

        this.monobankService.currentTransactions$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(txs => this.transactions.set(txs));
    }

    toggleTheme(): void {
        this.themeService.toggle();
    }

    toggleBalanceBlur(): void {
        const next = !this.balanceBlurred();
        this.balanceBlurred.set(next);
        localStorage.setItem('finance-blur-balance', String(next));
        document.documentElement.classList.toggle('balance-blurred', next);
    }

    toggleCompactMode(): void {
        const next = !this.compactMode();
        this.compactMode.set(next);
        localStorage.setItem('finance-compact', String(next));
    }

    logout(): void {
        this.authService.logout();
        this.router.navigateByUrl('/login');
    }
}
