import { ICategoryGroup, ITransaction } from '@core/interfaces';
import {
    assignTransaction, categoryIndexOf, explainCategory, isCounted, matchingIndexes, ruleKeyFor, summarize, toDefinitions,
    UNCATEGORIZED,
} from './categorize';

const tx = (over: Partial<ITransaction> & { id?: string }): ITransaction => ({
    id: over.id ?? Math.random().toString(36).slice(2),
    time: 1_780_000_000,
    description: '',
    mcc: 0,
    originalMcc: 0,
    amount: 0,
    operationAmount: 0,
    currencyCode: 980,
    cardCurrencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
    hold: false,
    receiptId: '',
    ...over,
} as ITransaction);

const group = (title: string, keys: string[], extra: Partial<ICategoryGroup> = {}): ICategoryGroup =>
    ({ emoji: '', title, keys, amount: 0, ...extra });

describe('categorize', () => {
    describe('categoryIndexOf', () => {
        it('prefers the longest matching key over category order', () => {
            // the user's real data: "Дія" sits in Taxes, "Дія | Штрафи" in My car
            const groups = [group('Taxes', ['Дія']), group('My car', ['Дія | Штрафи'])];

            expect(categoryIndexOf(tx({ description: 'Дія | Штрафи' }), groups)).toBe(1);
            expect(categoryIndexOf(tx({ description: 'Дія | Податки' }), groups)).toBe(0);
        });

        it('breaks equal-length ties by category order', () => {
            const groups = [group('Shops', ['apteka']), group('Sport', ['apteka'])];
            expect(categoryIndexOf(tx({ description: 'apteka 24' }), groups)).toBe(0);
        });

        it('matches case-insensitively on description, merchant or counterparty', () => {
            const groups = [group('Transport', ['uklon']), group('Home', ['Юрій Б.'])];
            expect(categoryIndexOf(tx({ description: 'UKLON trip' }), groups)).toBe(0);
            expect(categoryIndexOf(tx({ description: 'Переказ', counterName: 'Юрій Б.' }), groups)).toBe(1);
        });

        it('lets text rules beat MCC rules, and MCC rules follow category order', () => {
            const groups = [group('Shops', ['5411']), group('Food', ['Сільпо']), group('Other', ['5411'])];
            expect(categoryIndexOf(tx({ description: 'Сільпо', mcc: 5411 }), groups)).toBe(1);
            expect(categoryIndexOf(tx({ description: 'Novus', mcc: 5411 }), groups)).toBe(0);
        });

        it('lets a pinned transaction beat every key', () => {
            const groups = [group('Shops', ['Сільпо']), group('Gifts', [], { txIds: ['t1'] })];
            expect(categoryIndexOf(tx({ id: 't1', description: 'Сільпо' }), groups)).toBe(1);
            expect(categoryIndexOf(tx({ id: 't2', description: 'Сільпо' }), groups)).toBe(0);
        });

        it('matches a "^" key only at the start of the description', () => {
            const groups = [group('Installments', ['^Платіж']), group('Electronics', ['FOXTROT'])];
            expect(categoryIndexOf(tx({ description: 'Платіж FOXTROT' }), groups)).toBe(0);
            expect(categoryIndexOf(tx({ description: 'FOXTROT Платіж' }), groups)).toBe(1);
        });

        it('treats "3000-3999" as an MCC range and honours a category direction', () => {
            const groups = [group('Travel', ['3000-3999']), group('In', ['4829'], { direction: 'in' }), group('Out', ['4829'], { direction: 'out' })];
            expect(categoryIndexOf(tx({ description: 'Ryanair', mcc: 3246 }), groups)).toBe(0);
            expect(categoryIndexOf(tx({ description: 'Від: X', mcc: 4829, amount: 500 }), groups)).toBe(1);
            expect(categoryIndexOf(tx({ description: 'Переказ', mcc: 4829, amount: -500 }), groups)).toBe(2);
        });

        it('returns UNCATEGORIZED when nothing matches, and ignores blank keys', () => {
            const groups = [group('Some', ['', '  '])];
            expect(categoryIndexOf(tx({ description: 'anything' }), groups)).toBe(UNCATEGORIZED);
            expect(categoryIndexOf(tx({ description: 'x' }), [])).toBe(UNCATEGORIZED);
        });
    });

    describe('summarize', () => {
        it('counts each transaction in exactly one category — no double counting', () => {
            const groups = [group('Shops', ['apteka']), group('Sport', ['apteka'])];
            const { byIndex, uncategorized } = summarize([
                tx({ description: 'apteka', amount: -100 }),
                tx({ description: 'Glovo', amount: -50 }),
                tx({ description: 'Salary', amount: 1000 }),
            ], groups);

            expect(byIndex[0]).toEqual({ spent: 100, income: 0, net: -100, count: 1, spentCount: 1, incomeCount: 0 });
            expect(byIndex[1]).toEqual({ spent: 0, income: 0, net: 0, count: 0, spentCount: 0, incomeCount: 0 });
            expect(uncategorized).toEqual({ spent: 50, income: 1000, net: 950, count: 2, spentCount: 1, incomeCount: 1 });
        });
    });

    describe('isCounted', () => {
        it('drops transactions of an excluded (transfer) category from the totals', () => {
            const groups = [group('Transfers', ['Поповнення «'], { excluded: true }), group('Shops', ['Сільпо'])];
            expect(isCounted(tx({ description: 'Поповнення «Dollar»' }), groups)).toBe(false);
            expect(isCounted(tx({ description: 'Сільпо' }), groups)).toBe(true);
            expect(isCounted(tx({ description: 'unknown' }), groups)).toBe(true);
        });
    });

    describe('assignTransaction', () => {
        it('moves a merchant: writes the key on the target and removes the exact key elsewhere', () => {
            const groups = [group('Shops', ['Novus', 'Сільпо']), group('Food', ['Glovo'])];
            const next = assignTransaction(groups, tx({ description: 'Сільпо' }), 1, 'merchant');

            expect(next[0].keys).toEqual(['Novus']);
            expect(next[1].keys).toEqual(['Glovo', 'Сільпо']);
            expect(categoryIndexOf(tx({ description: 'Сільпо' }), next)).toBe(1);
        });

        it('does not duplicate a key the target already has', () => {
            const groups = [group('Food', ['сільпо'])];
            const next = assignTransaction(groups, tx({ description: 'Сільпо' }), 0, 'merchant');
            expect(next[0].keys).toEqual(['Сільпо']);
        });

        it('pins a single transaction without touching the merchant rule', () => {
            const groups = [group('Some', ['Переказ на картку']), group('Rent', [])];
            const rent = tx({ id: 'rent-aug', description: 'Переказ на картку' });
            const next = assignTransaction(groups, rent, 1, 'single');

            expect(next[0].keys).toEqual(['Переказ на картку']);
            expect(next[1].txIds).toEqual(['rent-aug']);
            expect(categoryIndexOf(rent, next)).toBe(1);
            expect(categoryIndexOf(tx({ description: 'Переказ на картку' }), next)).toBe(0);
        });

        it('pins as a fallback when a longer key elsewhere would still win', () => {
            // the counterparty key is longer than the description written as the new key
            const groups = [group('Family', ['Шкарупа Даниїл Олександрович']), group('Gifts', [])];
            const t = tx({ id: 'g1', description: 'Від: Д.', counterName: 'Шкарупа Даниїл Олександрович' });
            const next = assignTransaction(groups, t, 1, 'merchant');

            expect(categoryIndexOf(t, next)).toBe(1);
            expect(next[1].txIds).toEqual(['g1']);
        });

        it('moves a pin from one category to another', () => {
            const groups = [group('A', [], { txIds: ['x'] }), group('B', [])];
            const next = assignTransaction(groups, tx({ id: 'x', description: 'q' }), 1, 'single');
            expect(next[0].txIds).toBeUndefined();
            expect(next[1].txIds).toEqual(['x']);
        });
    });

    describe('matchingIndexes', () => {
        it('reports the winner and the categories it beat', () => {
            const groups = [group('Taxes', ['Дія']), group('My car', ['Дія | Штрафи'])];
            expect(matchingIndexes(tx({ description: 'Дія | Штрафи' }), groups).sort()).toEqual([0, 1]);
        });
    });

    describe('toDefinitions', () => {
        it('persists definitions only — never the derived totals', () => {
            const out = toDefinitions([
                { ...group('Shops', ['a'], { excluded: true, txIds: ['1'] }), amount: -500, spent: 500, count: 3 },
                group('Empty', []),
            ]);
            expect(out[0]).toEqual({ emoji: '', title: 'Shops', keys: ['a'], amount: 0, txIds: ['1'], excluded: true });
            expect(out[1]).toEqual({ emoji: '', title: 'Empty', keys: [], amount: 0 });
        });
    });

    describe('your rules', () => {
        const auto = () => [
            group('Перекази людям', ['4829', 'Переказ на картку'], { direction: 'out' }),
            group('Послуги', ['ФОП']),
            group('Дім', ['4900'], { rules: ['ФОП Красний', 'Олена А.', '*3701'] }),
        ];

        it('beat every built-in rule, even a longer text key', () => {
            expect(categoryIndexOf(tx({ description: 'ФОП Красний Владислав Анатолійович', mcc: 4829, amount: -2_600_000 }), auto())).toBe(2);
            expect(categoryIndexOf(tx({ description: 'Олена А.', mcc: 4829, amount: -1_000_000 }), auto())).toBe(2);
            expect(categoryIndexOf(tx({ description: '414960******3701', mcc: 4829, amount: -374_800 }), auto())).toBe(2);
            expect(categoryIndexOf(tx({ description: 'ФОП Інший', amount: -100 }), auto())).toBe(1);
        });

        it('lose only to a pinned transaction', () => {
            const groups = auto();
            groups[0] = { ...groups[0], txIds: ['p'] };
            expect(categoryIndexOf(tx({ id: 'p', description: 'Олена А.', amount: -1 }), groups)).toBe(0);
        });

        it('say which rule won', () => {
            expect(explainCategory(tx({ description: 'Олена А.', amount: -1 }), auto()).reason).toEqual({ by: 'rule', key: 'Олена А.' });
        });

        it('write a card number as its last four digits', () => {
            expect(ruleKeyFor(tx({ description: '414960******3701' }))).toBe('*3701');
            expect(ruleKeyFor(tx({ description: '414960****3701' }))).toBe('*3701');
            expect(ruleKeyFor(tx({ description: '  Сільпо ' }))).toBe('Сільпо');
        });
    });
});
