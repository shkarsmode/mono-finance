import { ITransaction } from '@core/interfaces';
import { buildFlowContext, flowOf, flowTotals, internalKind, isPendingHold, isRoundUp, roundUpJar } from './flows';

// Every description below is wording taken from the user's real statement.
const tx = (description: string, amount: number, over: Partial<ITransaction> = {}): ITransaction => ({
    id: Math.random().toString(36).slice(2),
    time: 1_780_000_000,
    description,
    mcc: 4829,
    originalMcc: 4829,
    amount,
    operationAmount: amount,
    currencyCode: 980,
    cardCurrencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
    hold: false,
    receiptId: '',
    ...over,
} as ITransaction);

const ctx = buildFlowContext('Шкарупа Даніїл', ['Хата', 'audi', 'Reserve', 'Dollar', 'VW']);

describe('flows', () => {
    describe('own jars vs other people\'s fundraisers', () => {
        it('treats a top-up of your own jar as money that only changed pockets', () => {
            expect(flowOf(tx('Поповнення «Хата»', -500000), ctx)).toBe('internal');
            expect(flowOf(tx('Поповнення «AUDI»', -100000), ctx)).toBe('internal');
        });

        it('treats a top-up of someone else\'s fundraiser as real spending', () => {
            expect(flowOf(tx('Поповнення «На ППО 3 ОШБР»', -50000), ctx)).toBe('spend');
            expect(flowOf(tx('Поповнення «Лікування Варюші»', -20000), ctx)).toBe('spend');
            expect(flowOf(tx('Поповнення «Поточний RUSORIZ»', -30000, { mcc: 8398 }), ctx)).toBe('spend');
        });

        it('knows withdrawals and round-ups are always your own jar', () => {
            expect(flowOf(tx('Часткове зняття банки «Dollar»', 1000000), ctx)).toBe('internal');
            expect(flowOf(tx('Виплата банки «СумДыра»', 400000), ctx)).toBe('internal');
            expect(flowOf(tx('Округлення балансу «Reserve»', -283), ctx)).toBe('internal');
            expect(flowOf(tx('Reserve', -712), ctx)).toBe('internal');
        });
    });

    it('treats transfers between your own Monobank cards as internal', () => {
        expect(flowOf(tx('На білу картку', -200000), ctx)).toBe('internal');
        expect(flowOf(tx('З Білої картки', 200000), ctx)).toBe('internal');
        expect(flowOf(tx('З Чорної картки', 50000), ctx)).toBe('internal');
        expect(flowOf(tx('З доларової картки', 4100000), ctx)).toBe('internal');
        expect(flowOf(tx('На доларову картку', -100000), ctx)).toBe('internal');
        expect(flowOf(tx('З єврової картки', 30000), ctx)).toBe('internal');
    });

    it('trusts the API on «Переказ на картку»: own card when it says so, a stranger otherwise', () => {
        // buying your own dollars: the white card only says «Переказ на картку»
        expect(flowOf(tx('Переказ на картку', -1_000_000, { ownTransfer: true }), ctx)).toBe('internal');
        expect(flowOf(tx('Переказ на картку', -100_000), ctx)).toBe('spend');
    });

    it('says which kind of own-money move a row is', () => {
        const twin = { cardId: 'usd', description: 'З Білої картки', amount: 22_227, time: 1 };
        expect(internalKind(tx('Переказ на картку', -1_000_000, { ownTransfer: twin }), ctx)).toBe('own-transfer');
        expect(internalKind(tx('З доларової картки', 4100000), ctx)).toBe('own-card');
        expect(internalKind(tx('Поповнення «Хата»', -500000), ctx)).toBe('own-jar');
        expect(internalKind(tx('Reserve', -712), ctx)).toBe('round-up');
        expect(internalKind(tx('Шкарупа Даніїл', -100000), ctx)).toBe('own-name');
        expect(internalKind(tx('Сільпо', -84260, { mcc: 5411 }), ctx)).toBeNull();
        expect(internalKind(tx('Поповнення «На ППО 3 ОШБР»', -50000), ctx)).toBeNull();
    });

    it('recognises your own name at another bank — but not a relative with the same surname', () => {
        expect(flowOf(tx('Шкарупа Даніїл', -100000), ctx)).toBe('internal');
        expect(flowOf(tx('Від: Daniil Shkarupa', 150000), ctx)).toBe('internal');
        expect(flowOf(tx('P24 *Shkarupa Daniil', 37300, { mcc: 6012 }), ctx)).toBe('internal');
        expect(flowOf(tx('Від: ШКАРУПА О.В.', 500000), ctx)).toBe('income');
    });

    it('keeps your FOP paying you as income — that is business income', () => {
        expect(flowOf(tx('Від: ШКАРУПА Д.О. ФОП', 5000000), ctx)).toBe('income');
    });

    it('keeps salaries, people and payments as they are', () => {
        expect(flowOf(tx('ТОВ "БУСТІРОІД ЮКРЕЙН"', 6000000), ctx)).toBe('income');
        expect(flowOf(tx('Від: Максим Баришов', 70000), ctx)).toBe('income');
        expect(flowOf(tx('Переказ на картку', -250000), ctx)).toBe('spend');
        expect(flowOf(tx('Сільпо', -84260, { mcc: 5411 }), ctx)).toBe('spend');
    });

    it('marks cancellations as refunds, deposits and installment credit as internal', () => {
        expect(flowOf(tx('Скасування. Bolt', 21900, { mcc: 4121 }), ctx)).toBe('refund');
        expect(flowOf(tx('Поповнення депозиту', -1000000), ctx)).toBe('internal');
        expect(flowOf(tx('Виплата депозиту', 23168400), ctx)).toBe('internal');
        expect(flowOf(tx('Розстрочка на картку', 10000000), ctx)).toBe('internal');
        expect(flowOf(tx('Каса Унiверсал Банку', 2050000), ctx)).toBe('internal');
        expect(flowOf(tx('Каса Унiверсал Банку', -7200000, { mcc: 6010 }), ctx)).toBe('spend');
    });

    it('calls a hold pending only for its first week', () => {
        const now = 1_790_000_000;
        expect(isPendingHold(tx('Glovo', -145079, { hold: true, time: now - 2 * 86400 }), now)).toBe(true);
        expect(isPendingHold(tx('Glovo', -145079, { hold: true, time: now - 14 * 86400 }), now)).toBe(false);
        expect(isPendingHold(tx('Glovo', -145079, { hold: false, time: now - 60 }), now)).toBe(false);
    });

    it('recognises round-ups and the jar they went to', () => {
        expect(isRoundUp(tx('Reserve', -712))).toBe(true);
        expect(isRoundUp(tx('Округлення балансу «Reserve»', -283))).toBe(true);
        expect(isRoundUp(tx('Поповнення «Reserve»', -100000))).toBe(false);
        expect(roundUpJar(tx('Округлення балансу «Скарбничка»', -100))).toBe('Скарбничка');
        expect(roundUpJar(tx('Reserve', -712))).toBe('Reserve');
    });

    describe('flowTotals', () => {
        const month = [
            tx('Сільпо', -100000, { mcc: 5411 }),
            tx('Скасування. Bolt', 20000, { mcc: 4121 }),
            tx('Bolt', -50000, { mcc: 4121 }),
            tx('Поповнення «Хата»', -1000000),
            tx('Часткове зняття банки «Хата»', 300000),
            tx('ТОВ "БУСТІРОІД ЮКРЕЙН"', 6000000),
        ];

        it('real: leaves own-money moves out and nets refunds against spending', () => {
            expect(flowTotals(month, ctx, 'real')).toEqual({
                spent: 130000, income: 6000000, refunds: 20000, internalOut: 1000000, internalIn: 300000,
            });
        });

        it('all: the raw statement — every debit spent, every credit earned', () => {
            const all = flowTotals(month, ctx, 'all');
            expect(all.spent).toBe(1150000);
            expect(all.income).toBe(6320000);
        });

        it('lets a not-counted category drop out as well', () => {
            const totals = flowTotals(month, ctx, 'real', t => t.description === 'Сільпо');
            expect(totals.spent).toBe(30000);
            expect(totals.internalOut).toBe(1100000);
        });
    });
});
