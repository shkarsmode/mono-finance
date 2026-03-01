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
                path: 'exchange',
                loadComponent: () =>
                    import('./pages/main-page/pages/exchange/exchange.component'),
            },
            {
                path: 'analytics/mcc',
                loadComponent: () =>
                    import('./features/analytics-mcc/mcc-analytics.component'),
            },
        ],
    },
    {
        path: '**',
        redirectTo: '',
    },
];

