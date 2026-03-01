# Mono Finance

Personal finance dashboard powered by the Monobank API.

## Tech Stack

- **Angular 18** — standalone components, signals, `@if`/`@for`/`@defer` control flow, `OnPush` everywhere
- **Angular Material 18** — selective imports (checkbox, select, tooltip, badge, form-field)
- **Chart.js 4** — lazy-loaded inside `@defer(on viewport)` blocks
- **RxJS 7** — HTTP layer; UI state via Angular signals
- **SCSS** — CSS custom-property design tokens, light/dark theme

## Quick Start

```bash
npm install --legacy-peer-deps
npm start                     # dev server → http://localhost:4200
```

## Production Build (Nginx-ready)

```bash
npm run build                 # → dist/finance-app/browser/
```

The output is a fully static SPA. Serve with any static HTTP server.  
Example **Nginx** config:

```nginx
server {
    listen 80;
    root /var/www/finance-app/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|woff2|ico|png|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Project Structure

```
src/
├── main.ts                    # bootstrapApplication (no NgModule)
├── styles.scss                # global tokens, themes, fonts, reset
├── styles/                    # design system partials
│   ├── _tokens.scss
│   ├── _themes.scss
│   ├── _fonts.scss
│   ├── _mixins.scss
│   └── _reset.scss
└── app/
    ├── app.config.ts          # ApplicationConfig (providers, interceptors)
    ├── app.routing.ts         # lazy loadComponent routes
    ├── app.component.ts       # root (RouterOutlet + global progress bar)
    ├── core/                  # guards, interceptors, services, interfaces, tokens
    ├── features/
    │   └── analytics-mcc/     # MCC analytics page
    ├── pages/
    │   ├── login-page/
    │   └── main-page/         # sidenav + topbar + bottomnav shell
    │       └── pages/
    │           ├── dashboard/  # cards · charts · transactions table
    │           └── exchange/   # currency converter
    └── shared/
        ├── components/        # UI kit (button, card, skeleton, empty-state, chip, toast)
        └── pipes/
```

## Theme System

Toggled via `ThemeService` (`inject(ThemeService).toggle()`).  
Reads `prefers-color-scheme` on first visit; persists choice in `localStorage`.  
CSS custom properties switch on `html[data-theme="light"|"dark"]`.

## Routes

| Path | Component | Lazy |
|---|---|---|
| `/login` | `LoginPageComponent` | ✓ |
| `/` → `/dashboard` | `DashboardComponent` | ✓ |
| `/exchange` | `ExchangeComponent` | ✓ |
| `/analytics/mcc` | `MccAnalyticsComponent` | ✓ |

## Environment

Copy and edit `src/environments/environment.ts`:

```ts
export const environment = {
    production: false,
    basePathApi: 'https://your-api.example.com/api',
    monobankApi: 'https://api.monobank.ua',
};
```
