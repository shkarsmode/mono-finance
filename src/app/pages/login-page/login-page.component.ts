import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AppRouteEnum } from '@core/enums';
import { catchError, first } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-login-page',
    standalone: true,
    imports: [ReactiveFormsModule],
    templateUrl: './login-page.component.html',
    styleUrl: './login-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginPageComponent {
    private readonly router = inject(Router);
    private readonly authService = inject(AuthService);
    private readonly destroyRef = inject(DestroyRef);

    readonly errorMessage = signal('');
    readonly isLoading = signal(false);
    readonly showPassword = signal(false);
    readonly showTokenGuide = signal(false);

    readonly loginForm = new FormGroup({
        email: new FormControl('', { validators: [Validators.required, Validators.email] }),
        // No length rule here — the server is the authority on credentials.
        password: new FormControl('', { validators: [Validators.required] }),
    });

    togglePassword(): void {
        this.showPassword.update(v => !v);
    }

    toggleTokenGuide(): void {
        this.showTokenGuide.update(v => !v);
    }

    login(): void {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        this.authService.login(this.loginForm.value as { email: string; password: string }).pipe(
            first(),
            takeUntilDestroyed(this.destroyRef),
            catchError((error) => {
                this.isLoading.set(false);
                const msg = error?.error?.message;
                if (msg) {
                    this.errorMessage.set(msg);
                } else if (typeof error?.error === 'string') {
                    this.errorMessage.set(error.error);
                } else {
                    this.errorMessage.set('Щось пішло не так. Спробуйте ще раз.');
                }
                throw error;
            })
        ).subscribe(() => {
            this.router.navigateByUrl(AppRouteEnum.Main);
        });
    }
}
