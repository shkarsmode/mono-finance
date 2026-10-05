import { BehaviorSubject } from 'rxjs';
import { CategoryGroupService } from './category-group.service';

/**
 * The bug these cover: totals used to be recomputed only when TRANSACTIONS emitted.
 * Categories normally finish loading after the transactions, so the recompute never
 * ran again and every category rendered 0,00.
 */
describe('CategoryGroupService', () => {
    const tx = (over: Partial<any>) => ({
        id: String(Math.random()),
        description: '',
        counterName: '',
        merchantName: '',
        mcc: 0,
        originalMcc: 0,
        amount: 0,
        ...over,
    });

    function make() {
        const currentTransactions$ = new BehaviorSubject<any[]>([]);
        const monobank: any = {
            currentTransactions$,
            categoryGroups$: new BehaviorSubject<any[]>([]),
            clientInfo$: new BehaviorSubject<any>(null),
        };
        const http: any = { post: () => ({ pipe: () => ({ subscribe: () => undefined }) }) };
        const loading: any = { loading$: { next: () => undefined } };
        const toast: any = { error: () => undefined };
        const service = new CategoryGroupService(http, monobank, '/api', loading, toast);
        // these specs exercise YOUR categories; the automatic set is covered in auto-categories.spec
        service.setMode('mine');
        return { service, monobank, currentTransactions$ };
    }

    it('totals the categories when they load AFTER the transactions', () => {
        const { service, monobank, currentTransactions$ } = make();

        // transactions first…
        currentTransactions$.next([
            tx({ description: 'Шарлотка', amount: -55500 }),
            tx({ description: 'Сільпо', amount: -84260 }),
        ]);
        // …categories second — the order that used to produce zeros
        monobank.categoryGroups$.next([
            { emoji: '🍰', title: 'Шарлотка', keys: ['Шарлотка'], amount: 0 },
            { emoji: '🛒', title: 'Shops', keys: ['Сільпо'], amount: 0 },
        ]);

        const groups = service.categoryGroups$.getValue();
        expect(groups.map(g => g.amount)).toEqual([-55500, -84260]);
    });

    it('re-totals when the period changes', () => {
        const { service, monobank, currentTransactions$ } = make();
        monobank.categoryGroups$.next([{ emoji: '🛒', title: 'Shops', keys: ['Сільпо'], amount: 0 }]);

        currentTransactions$.next([tx({ description: 'Сільпо', amount: -100 })]);
        expect(service.categoryGroups$.getValue()[0].amount).toBe(-100);

        currentTransactions$.next([tx({ description: 'Сільпо', amount: -250 })]);
        expect(service.categoryGroups$.getValue()[0].amount).toBe(-250);
    });

    it('matches a numeric key as an MCC and text keys case-insensitively', () => {
        const { service, monobank, currentTransactions$ } = make();
        monobank.categoryGroups$.next([
            { emoji: '🍔', title: 'FastFood', keys: ['5814'], amount: 0 },
            { emoji: '🚕', title: 'Transport', keys: ['uklon'], amount: 0 },
        ]);

        currentTransactions$.next([
            tx({ description: 'Some cafe', mcc: 5814, amount: -9500 }),
            tx({ description: 'UKLON trip', amount: -30200 }),
        ]);

        expect(service.categoryGroups$.getValue().map(g => g.amount)).toEqual([-9500, -30200]);
    });

    it('does not mutate the stored definitions when totalling', () => {
        const { service, monobank, currentTransactions$ } = make();
        const stored = [{ emoji: '🛒', title: 'Shops', keys: ['Сільпо'], amount: 0 }];
        monobank.categoryGroups$.next(stored);
        currentTransactions$.next([tx({ description: 'Сільпо', amount: -777 })]);

        expect(service.categoryGroups$.getValue()[0].amount).toBe(-777);
        expect(stored[0].amount).toBe(0); // the server copy stays clean
    });

    it('ignores a category with no keys instead of matching everything', () => {
        const { service, monobank, currentTransactions$ } = make();
        monobank.categoryGroups$.next([{ emoji: '❓', title: 'Some', keys: [], amount: 0 }]);
        currentTransactions$.next([tx({ description: 'anything', amount: -500 })]);

        expect(service.categoryGroups$.getValue()[0].amount).toBe(0);
    });

    it('shows the automatic categories in auto mode and recognises own money from the profile', () => {
        const { service, monobank, currentTransactions$ } = make();
        service.setMode('auto');
        monobank.clientInfo$.next({ name: 'Петренко Олена', ownJars: ['Хата'], jars: [] });
        currentTransactions$.next([
            tx({ description: 'Поповнення «Хата»', amount: -500000 }),
            tx({ description: 'Сільпо', mcc: 5411, amount: -84260 }),
        ]);

        const groups = service.categoryGroups$.getValue();
        expect(groups.find(g => g.title === 'Own money')?.amount).toBe(-500000);
        expect(groups.find(g => g.title === 'Groceries')?.amount).toBe(-84260);
    });

    it('remembers the chosen modes', () => {
        const { service } = make();
        service.setMode('auto');
        service.setCountMode('all');
        expect(localStorage.getItem('finance-category-mode')).toBe('auto');
        expect(localStorage.getItem('finance-count-mode')).toBe('all');
        service.setCountMode('real');
    });
});
