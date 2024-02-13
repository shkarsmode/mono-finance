import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppRouteEnum } from '@core/enums';

const routes: Routes = [
    {
        path: AppRouteEnum.Login,
        loadChildren: () => import('./pages').then((m) => m.LoginPageModule),
    },
    {
        path: AppRouteEnum.Main,
        loadChildren: () => import('./pages').then((m) => m.MainPageModule),
    },
    {
        path: '**',
        redirectTo: AppRouteEnum.Main,
    },
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes, {
            enableViewTransitions: true
        }),
    ],
    exports: [RouterModule],
})
export class AppRoutingModule {}
