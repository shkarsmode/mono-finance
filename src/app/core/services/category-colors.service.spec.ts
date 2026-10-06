import { assignSlots } from './category-colors.service';

describe('assignSlots', () => {
    const top = ['Shopping', 'Taxes', 'Transfers', 'Groceries', 'Car', 'Subscriptions'];

    it('fills empty slots in ranking order', () => {
        expect(assignSlots(Array(6).fill(null), top)).toEqual(top);
    });

    it('keeps every colour when the top six only reshuffle', () => {
        const reshuffled = ['Car', 'Groceries', 'Shopping', 'Subscriptions', 'Taxes', 'Transfers'];
        expect(assignSlots(top, reshuffled)).toEqual(top);
    });

    it('gives a newcomer the slot that was freed, and nothing else moves', () => {
        const next = ['Shopping', 'Taxes', 'Sport', 'Groceries', 'Car', 'Subscriptions', 'Transfers'];
        expect(assignSlots(top, next)).toEqual(['Shopping', 'Taxes', 'Sport', 'Groceries', 'Car', 'Subscriptions']);
    });

    it('leaves a slot empty when fewer than six categories have spending', () => {
        expect(assignSlots(top, ['Groceries', 'Car'])).toEqual([null, null, null, 'Groceries', 'Car', null]);
    });
});
