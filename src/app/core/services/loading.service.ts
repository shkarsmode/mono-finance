import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class LoadingService {
    public readonly loading$: BehaviorSubject<boolean> = new BehaviorSubject(true);
}
