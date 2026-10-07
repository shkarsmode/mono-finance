import { ITransaction } from '@core/interfaces';
import {
    buildFlowContext, CANCEL_WINDOW_SEC, cancellationPairs, flowOf, flowTotals, internalKind, isPendingHold, isRoundUp,
    partyLabel, roundUpJar,
} from './flows';

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

    describe('refunds belong to their merchant', () => {
        it('names the merchant a refund came back from', () => {
            expect(partyLabel(tx('Скасування. Glovo', 47655))).toBe('Glovo');
            expect(partyLabel(tx('Скасування. 545708****0850', 10000))).toBe('545708****0850');
            expect(partyLabel(tx('  Glovo ', -47655))).toBe('Glovo');
            // only money coming back is a refund
            expect(partyLabel(tx('Скасування. Glovo', -47655))).toBe('Скасування. Glovo');
            expect(partyLabel(tx('Скасування', 1000))).toBe('Скасування');
        });

        // September 2026 on the white card, as the statement has it: 21 Glovo charges, 7 of them cancelled
        const at = (day: number, hhmm: string) => {
            const [h, m] = hhmm.split(':').map(Number);
            return Date.UTC(2026, 8, day, h - 3, m) / 1000;
        };
        const glovo = (id: string, day: number, hhmm: string, amount: number, over: Partial<ITransaction> = {}) =>
            tx(amount > 0 ? 'Скасування. Glovo' : 'Glovo', amount, { id, time: at(day, hhmm), mcc: 5811, ...over });
        const september = [
            glovo('a', 4, '12:59', -47264), glovo('b', 5, '16:18', -30278), glovo('c', 7, '16:42', -30278),
            glovo('d', 9, '13:07', -48297), glovo('e', 12, '19:52', -65556),
            glovo('f', 14, '12:49', -47655), glovo('F', 14, '14:20', 47655),
            glovo('g', 14, '14:24', -47655), glovo('G', 14, '15:20', 47655),
            glovo('h', 14, '17:01', -77920), glovo('H', 14, '17:21', 77920),
            glovo('i', 14, '17:28', -35899), glovo('I', 14, '17:50', 35899),
            glovo('j', 15, '12:39', -51655), glovo('J', 15, '13:24', 51655),
            glovo('k', 15, '13:27', -48297), glovo('K', 15, '14:10', 48297),
            glovo('l', 20, '14:11', -144769), glovo('m', 20, '14:44', -30278),
            glovo('n', 22, '02:12', -145079, { hold: true, mcc: 5814 }), glovo('L', 22, '02:12', 144769),
            glovo('o', 22, '11:55', -19900), glovo('p', 24, '14:38', -57363), glovo('q', 24, '22:09', -49502),
            glovo('r', 27, '11:37', -56392), glovo('s', 29, '15:11', -39644), glovo('t', 30, '10:43', -80030),
            glovo('u', 30, '21:21', -62010),
        ];

        it('pairs every cancellation with the order it undid', () => {
            const pairs = cancellationPairs(september, t => t);
            expect(pairs.size).toBe(14);
            // two orders of the same amount on one day: each refund takes the latest order before it
            expect(pairs.get('F')?.id).toBe('f');
            expect(pairs.get('G')?.id).toBe('g');
            expect(pairs.get('f')?.id).toBe('F');
            // the 20 Sep order was cancelled and charged again at a slightly different amount
            expect(pairs.get('L')?.id).toBe('l');
            expect(pairs.has('n')).toBe(false);

            const real = september.filter(t => !pairs.has(t.id));
            expect(real.length).toBe(14);
            const net = september.reduce((sum, t) => sum + t.amount, 0);
            expect(net).toBe(-761871);
            expect(real.reduce((sum, t) => sum + t.amount, 0)).toBe(-761871);
        });

        it('leaves a partial refund, an older order and another card unpaired', () => {
            const order = tx('Rozetka', -100000, { id: 'o', time: 1_000_000 });
            const partial = tx('Скасування. Rozetka', 40000, { id: 'p', time: 1_000_100 });
            expect(cancellationPairs([order, partial], t => t).size).toBe(0);

            const late = tx('Скасування. Rozetka', 100000, { id: 'l', time: 1_000_000 + CANCEL_WINDOW_SEC + 1 });
            expect(cancellationPairs([order, late], t => t).size).toBe(0);

            const before = tx('Скасування. Rozetka', 100000, { id: 'b', time: 999_000 });
            expect(cancellationPairs([order, before], t => t).size).toBe(0);

            const rows = [{ tx: order, card: 'white' }, { tx: tx('Скасування. Rozetka', 100000, { id: 'x', time: 1_000_100 }), card: 'black' }];
            expect(cancellationPairs(rows, r => r.tx, r => r.card).size).toBe(0);
            expect(cancellationPairs(rows, r => r.tx).size).toBe(2);
        });

        it('matches a purchase abroad by its own currency, not the hryvnia figure', () => {
            const order = tx('Steam', -41500, { id: 's', time: 1_000_000, operationAmount: -1000, currencyCode: 840 });
            const refund = tx('Скасування. Steam', 41210, { id: 'S', time: 1_200_000, operationAmount: 1000, currencyCode: 840 });
            expect(cancellationPairs([order, refund], t => t).get('S')?.id).toBe('s');
        });
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
