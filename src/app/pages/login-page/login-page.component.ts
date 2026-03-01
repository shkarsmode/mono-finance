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

    readonly formGroup = new FormGroup({
        email: new FormControl('', { validators: [Validators.required, Validators.email] }),
        password: new FormControl('', { validators: [Validators.required, Validators.minLength(6)] }),
    });

    togglePassword(): void {
        this.showPassword.update(v => !v);
    }

    login(): void {
        if (this.formGroup.invalid) {
            this.formGroup.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        this.authService.login(this.formGroup.value as { email: string; password: string }).pipe(
            first(),
            takeUntilDestroyed(this.destroyRef),
            catchError((error) => {
                this.isLoading.set(false);
                if (error?.error) {
                    this.errorMessage.set(typeof error.error === 'string' ? error.error : 'Login failed. Please try again.');
                } else {
                    this.errorMessage.set('Something went wrong. Please try again.');
                }
                throw error;
            })
        ).subscribe(() => {
            this.router.navigateByUrl(AppRouteEnum.Main);
        });
    }
}
