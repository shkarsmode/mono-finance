import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainPageRouteEnum } from './enums';
import { MainPageComponent } from './main-page.component';

export const routes: Routes = [
    {
        path: '',
        component: MainPageComponent,
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: MainPageRouteEnum.Dashboard,
            },
            {
                path: MainPageRouteEnum.Dashboard,
                loadChildren: () =>
                    import('./pages').then((m) => m.DashboardModule),
                data: { animation: MainPageRouteEnum.Dashboard },
            },
            {
                path: MainPageRouteEnum.Exchange,
                loadChildren: () => import('./pages').then((m) => m.ExchangeModule)
            },
            { path: 'analytics/mcc', loadComponent: () => import('../../features/analytics-mcc').then(m => m.MccAnalyticsComponent) },
        ],
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
    providers: [],
})
export class MainPageRoutingModule {}
