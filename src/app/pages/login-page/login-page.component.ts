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

    readonly activeTab = signal<'login' | 'register'>('login');
    readonly errorMessage = signal('');
    readonly successMessage = signal('');
    readonly isLoading = signal(false);
    readonly showPassword = signal(false);
    readonly showRegPassword = signal(false);
    readonly showTokenGuide = signal(false);

    readonly loginForm = new FormGroup({
        email: new FormControl('', { validators: [Validators.required, Validators.email] }),
        password: new FormControl('', { validators: [Validators.required, Validators.minLength(6)] }),
    });

    readonly registerForm = new FormGroup({
        email: new FormControl('', { validators: [Validators.required, Validators.email] }),
        password: new FormControl('', { validators: [Validators.required, Validators.minLength(6)] }),
        monobankToken: new FormControl('', { validators: [Validators.required, Validators.minLength(10)] }),
    });

    switchTab(tab: 'login' | 'register'): void {
        this.activeTab.set(tab);
        this.errorMessage.set('');
        this.successMessage.set('');
    }

    togglePassword(): void {
        this.showPassword.update(v => !v);
    }

    toggleRegPassword(): void {
        this.showRegPassword.update(v => !v);
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
                    this.errorMessage.set('Something went wrong. Please try again.');
                }
                throw error;
            })
        ).subscribe(() => {
            this.router.navigateByUrl(AppRouteEnum.Main);
        });
    }

    register(): void {
        if (this.registerForm.invalid) {
            this.registerForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');
        this.successMessage.set('');

        this.authService.registration(this.registerForm.value as {
            email: string;
            password: string;
            monobankToken: string;
        }).pipe(
            first(),
            takeUntilDestroyed(this.destroyRef),
            catchError((error) => {
                this.isLoading.set(false);
                const msg = error?.error?.message || error?.error;
                this.errorMessage.set(typeof msg === 'string' ? msg : 'Registration failed. Please try again.');
                throw error;
            })
        ).subscribe((res) => {
            this.isLoading.set(false);
            this.successMessage.set(res.message);
            this.registerForm.reset();
        });
    }
}
