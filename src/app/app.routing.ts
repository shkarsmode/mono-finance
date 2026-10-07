import { Routes } from '@angular/router';
import { authGuard } from '@core/helpers';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () =>
            import('./pages/login-page/login-page.component'),
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/main-page/main-page.component').then(m => m.MainPageComponent),
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: 'dashboard',
            },
            {
                path: 'dashboard',
                loadComponent: () =>
                    import('./pages/main-page/pages/dashboard/dashboard.component'),
            },
            {
                path: 'trends',
                loadComponent: () =>
                    import('./pages/main-page/pages/trends/trends.component'),
            },
            {
                // «Олена А. за всі місяці» — /trends/counterparty?q=<label>, under Динаміка
                path: 'trends/counterparty',
                loadComponent: () =>
                    import('./pages/main-page/pages/counterparty/counterparty.component'),
            },
            {
                path: 'categories',
                loadComponent: () =>
                    import('./pages/main-page/pages/categories/categories.component'),
            },
            {
                path: 'exchange',
                loadComponent: () =>
                    import('./pages/main-page/pages/exchange/exchange.component'),
            },
            {
                path: 'subscriptions',
                loadComponent: () =>
                    import('./pages/main-page/pages/subscriptions/subscriptions.component'),
            },
            {
                path: 'analytics/mcc',
                loadComponent: () =>
                    import('./features/analytics-mcc/mcc-analytics.component'),
            },
            {
                path: 'insights',
                loadComponent: () =>
                    import('./pages/main-page/pages/insights/insights.component'),
            },
            {
                path: 'calendar',
                loadComponent: () =>
                    import('./pages/main-page/pages/calendar/calendar.component'),
            },
            {
                path: 'changelog',
                loadComponent: () =>
                    import('./pages/main-page/pages/changelog/changelog.component'),
            },
            {
                path: 'profile',
                loadComponent: () =>
                    import('./pages/main-page/pages/profile/profile.component'),
            },
            {
                path: 'transactions/:id',
                loadComponent: () =>
                    import('./pages/main-page/pages/transaction-details/transaction-details.component'),
            },
        ],
    },
    {
        path: '**',
        redirectTo: '',
    },
];

