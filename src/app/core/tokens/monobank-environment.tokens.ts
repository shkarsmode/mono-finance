import { InjectionToken } from "@angular/core";

export const MONOBANK_API: InjectionToken<string> = new InjectionToken(
    'monobankApi'
);

export const BASE_PATH_API: InjectionToken<string> = new InjectionToken(
    'basePathApi'
);