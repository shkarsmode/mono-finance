import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class LocalStorageService {
    public get<T>(key: string): T {
        const data = localStorage.getItem(key);
        try {
            return data ? JSON.parse(data) : null
        } catch (error) {
            return data as T;
        }
    }

    public set(key: string, data: any): void {
        const value = typeof data === 'string' ? data : JSON.stringify(data);

        localStorage.setItem(key, value);
    }

    public remove(key: string): void {
        localStorage.removeItem(key);
    }

    public clear(): void {
        localStorage.clear();
    }
}
