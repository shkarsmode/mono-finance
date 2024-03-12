import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AppRouteEnum } from '@core/enums';
import { Subject, catchError, first } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrl: './login-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent implements OnInit, OnDestroy {
    public formGroup: FormGroup;
    public token: string = '';
    public errorMessage: string = '';
    public isLoading: boolean = false;

    private destroy$: Subject<void> = new Subject();

    constructor(
        private readonly authService: AuthService,
        private readonly router: Router,
        private readonly cdr: ChangeDetectorRef
    ) {}

    public ngOnInit(): void {
        this.initFormControl();
    }

    private initFormControl(): void {
        this.formGroup = new FormGroup({
            email: new FormControl('', { validators: [Validators.email] }),
            password: new FormControl('', {
                validators: [Validators.minLength(6)],
            }),
        });
    }

    public login(): void {
        if (this.formGroup.invalid) {
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';

        this.authService.login(this.formGroup.value).pipe(
            first(),
            catchError((error) => {
                this.handleAuthDataErrorResponse(error);
                throw new Error(error);
            })
        ).subscribe(response => {
            console.log(response);
            this.router.navigateByUrl(AppRouteEnum.Main);
        });
    }

    // public onInputChange(event: any): void {
    //     this.token = event.target.value
    //     this.isValid = this.token.length > 5;
    //     this.errorMessage = '';
    // }

    // private initAuthDataObserver(): void {
    //     this.authService.authData$
    //         .pipe(takeUntil(this.destroy$))
    //         .subscribe(this.handleAuthDataResponse.bind(this));
    // }

    private handleAuthDataErrorResponse(
        error: any
    ): void {
        this.isLoading = false;
        this.cdr.detectChanges();

        if (!error) return;
        if ('error' in error) {
            this.errorMessage = error.error;
            this.cdr.detectChanges();
            return;
        }
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
