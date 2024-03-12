import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { LoginPageComponent } from './login-page.component';
import { LoginPageRoutingModule } from './login-page.routing';

@NgModule({
    declarations: [LoginPageComponent],
    imports: [CommonModule, LoginPageRoutingModule, ReactiveFormsModule],
})
export class LoginPageModule {}
