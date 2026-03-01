import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingService } from '@core/services/loading.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet],
    template: `
        <router-outlet></router-outlet>
        @if (loadingService.isLoading()) {
            <div class="global-progress">
                <div class="global-progress__bar"></div>
            </div>
        }
    `,
    styles: [`
        .global-progress {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            z-index: var(--z-toast);
            overflow: hidden;
        }
        .global-progress__bar {
            height: 100%;
            background: var(--color-primary);
            animation: progress-indeterminate 1.4s ease-in-out infinite;
        }
        @keyframes progress-indeterminate {
            0% { transform: translateX(-100%); width: 40%; }
            50% { transform: translateX(20%); width: 60%; }
            100% { transform: translateX(100%); width: 40%; }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
    public readonly loadingService = inject(LoadingService);
}

