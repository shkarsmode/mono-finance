import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
) => {
    return inject(AuthGuard).canActivate(inject(Router));
};

@Injectable({
    providedIn: 'root',
})
export class AuthGuard {
    constructor(
        private readonly authService: AuthService
    ) {}
    
    public canActivate(router: Router): boolean {
        const token = this.authService.token;
        
        if (token && token.length > 30) {
            return true;
        } else {
            router.navigate(['/login']);
            return false;
        }
    }

    public canMatch(router: Router): boolean {
        return this.canActivate(router);
    }
}
