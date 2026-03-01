import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
    // Keep BehaviorSubject for backward compatibility with existing code
    public readonly loading$ = new BehaviorSubject<boolean>(false);

    // Signal-based for new code
    public readonly isLoading = signal(false);

    public show(): void {
        this.loading$.next(true);
        this.isLoading.set(true);
    }

    public hide(): void {
        this.loading$.next(false);
        this.isLoading.set(false);
    }
}
