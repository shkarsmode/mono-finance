import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { LoginPageComponent } from './login-page.component';
import { LoginPageRoutingModule } from './login-page.routing';

@NgModule({
    declarations: [LoginPageComponent],
    imports: [CommonModule, LoginPageRoutingModule],
})
export class LoginPageModule {}
