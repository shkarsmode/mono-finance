import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Background requests — the sync-status poll, the chart history prefetch — fail
 * quietly: the next tick retries, the page shows its own state, and a toast would
 * only alarm (e.g. the few seconds the API restarts on a deploy).
 */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/** `{ context: silent() }` on a request keeps its failures out of the toasts. */
export const silent = (): HttpContext => new HttpContext().set(SILENT_ERRORS, true);
