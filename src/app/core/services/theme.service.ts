import { effect, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    public readonly theme = signal<Theme>(this.getInitialTheme());

    constructor() {
        effect(() => {
            const t = this.theme();
            document.documentElement.setAttribute('data-theme', t);
            localStorage.setItem('finance-theme', t);
        });
    }

    public toggle(): void {
        this.theme.update(t => t === 'light' ? 'dark' : 'light');
    }

    public set(theme: Theme): void {
        this.theme.set(theme);
    }

    private getInitialTheme(): Theme {
        const saved = localStorage.getItem('finance-theme');
        if (saved === 'dark' || saved === 'light') return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
}
