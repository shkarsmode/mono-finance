import { BehaviorSubject } from 'rxjs';
import { CategoryGroupService } from './category-group.service';

/**
 * The automatic categories with YOUR rules on top. Also the old bug: totals were
 * recomputed only when TRANSACTIONS emitted, so categories that loaded later
 * rendered 0,00.
 */
describe('CategoryGroupService', () => {
    const tx = (over: Partial<any>): any => ({
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
        localStorage.removeItem('finance-category-mode-v2');
        const currentTransactions$ = new BehaviorSubject<any[]>([]);
        const monobank: any = {
            currentTransactions$,
            categoryGroups$: new BehaviorSubject<any[]>([]),
            clientInfo$: new BehaviorSubject<any>(null),
        };
        const posted: any[] = [];
        const http: any = { post: (_url: string, body: any) => { posted.push(body); return { pipe: () => ({ subscribe: () => undefined }) }; } };
        const loading: any = { loading$: { next: () => undefined } };
        const toast: any = { error: () => undefined };
        const service = new CategoryGroupService(http, monobank, '/api', loading, toast);
        monobank.clientInfo$.next({ name: 'Петренко Олена', ownJars: ['Хата'], jars: [] });
        return { service, monobank, currentTransactions$, posted };
    }

    const amountOf = (service: CategoryGroupService, title: string) =>
        service.categoryGroups$.getValue().find(g => g.title === title)?.amount;

    it('starts with the automatic categories plus your rules', () => {
        const { service } = make();
        expect(service.mode).toBe('plus');
    });

    it('applies your rule over the built-in ones: rent paid to a FOP lands in Дім', () => {
        const { service, monobank, currentTransactions$ } = make();
        currentTransactions$.next([tx({ description: 'ФОП Красний Владислав Анатолійович', mcc: 4829, amount: -2_600_000 })]);
        expect(amountOf(service, 'Дім')).toBe(0);              // without a rule: a payment to a FOP is «Послуги»

        // the rules arrive AFTER the transactions — the order that used to produce zeros
        monobank.categoryGroups$.next([{ kind: 'rules', title: 'Дім', keys: ['ФОП Красний'] }]);
        expect(amountOf(service, 'Дім')).toBe(-2_600_000);
        expect(amountOf(service, 'Послуги')).toBe(0);
    });

    it('ignores your rules in «Авто»', () => {
        const { service, monobank, currentTransactions$ } = make();
        monobank.categoryGroups$.next([{ kind: 'rules', title: 'Дім', keys: ['Олена А.'] }]);
        currentTransactions$.next([tx({ description: 'Олена А.', mcc: 4829, amount: -1_000_000 })]);
        expect(amountOf(service, 'Дім')).toBe(-1_000_000);

        service.setMode('auto');
        expect(amountOf(service, 'Дім')).toBe(0);
        expect(amountOf(service, 'Перекази людям')).toBe(-1_000_000);
    });

    it('ignores the old free-form categories stored before', () => {
        const { service, monobank, currentTransactions$ } = make();
        monobank.categoryGroups$.next([{ emoji: '🛒', title: 'Магазини', keys: ['Сільпо'], amount: 0 }]);
        currentTransactions$.next([tx({ description: 'Сільпо', mcc: 5411, amount: -84_260 })]);
        expect(service.rules).toEqual([]);
        expect(amountOf(service, 'Продукти')).toBe(-84_260);
    });

    it('«everything like this» writes a rule: a card number keeps only its last four digits', () => {
        const { service, currentTransactions$, posted } = make();
        const utilities = tx({ description: '414960******3701', mcc: 4829, amount: -374_800 });
        currentTransactions$.next([utilities, tx({ description: '414960****3701', mcc: 4829, amount: -360_700 })]);

        service.assign(utilities, 'Дім', 'merchant');
        expect(posted.at(-1)).toEqual([{ kind: 'rules', title: 'Дім', keys: ['*3701'] }]);
        expect(amountOf(service, 'Дім')).toBe(-735_500);
    });

    it('moves a single transaction without touching the others', () => {
        const { service, currentTransactions$ } = make();
        const one = tx({ id: 'a', description: 'Переказ на картку', mcc: 4829, amount: -100_000 });
        currentTransactions$.next([one, tx({ id: 'b', description: 'Переказ на картку', mcc: 4829, amount: -50_000 })]);

        service.assign(one, 'Дім', 'single');
        expect(amountOf(service, 'Дім')).toBe(-100_000);
        expect(amountOf(service, 'Перекази людям')).toBe(-50_000);

        service.unpin('Дім', 'a');
        expect(amountOf(service, 'Дім')).toBe(0);
    });

    it('a rule moves out of its old category, and its note goes with it', () => {
        const { service } = make();
        service.addRule('Авто', 'Олена А.', 'паркінг');
        service.addRule('Дім', 'Олена А.', 'паркінг');
        expect(service.rules).toEqual([{ kind: 'rules', title: 'Дім', keys: ['Олена А.'], notes: { 'Олена А.': 'паркінг' } }]);

        service.removeRule('Дім', 'Олена А.');
        expect(service.rules).toEqual([]);
    });

    it('remembers the chosen modes', () => {
        const { service } = make();
        service.setMode('auto');
        service.setCountMode('all');
        expect(localStorage.getItem('finance-category-mode-v2')).toBe('auto');
        expect(localStorage.getItem('finance-count-mode')).toBe('all');
        service.setCountMode('real');
    });
});
