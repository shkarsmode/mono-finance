import { axisTick, axisUnit, compactMoney, niceTicks, topRoundedBar } from './chart-utils';

describe('chart-utils', () => {
    it('makes clean ticks that cover the maximum', () => {
        expect(niceTicks(184_000)).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
        expect(niceTicks(9_400)).toEqual([0, 2_500, 5_000, 7_500, 10_000]);
        expect(niceTicks(0)).toEqual([0]);
        const ticks = niceTicks(123_456_789);
        expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(123_456_789);
    });

    it('writes compact amounts from minor units', () => {
        expect(compactMoney(125_000)).toBe('1 250'.replace(' ', ' '));
        expect(compactMoney(1_248_000)).toBe('12,5 тис.');
        expect(compactMoney(12_480_000)).toBe('125 тис.');
        expect(compactMoney(21_000_000)).toBe('210 тис.');
        expect(compactMoney(230_000_000)).toBe('2,3 млн');
        expect(compactMoney(-500_000)).toBe('−5 000');
    });

    it('puts one unit on an axis instead of on every tick', () => {
        const thousands = axisUnit(10_000_000);              // top tick 100 000 ₴
        expect(thousands.unit).toBe('тис.');
        expect([0, 2_500_000, 10_000_000].map(t => axisTick(t, thousands.div))).toEqual(['0', '25', '100']);
        expect(axisTick(250_000, axisUnit(1_000_000).div)).toBe('2,5');
        expect(axisUnit(500_000).unit).toBe('');             // under 10 000 ₴ the numbers stay whole
        expect(axisUnit(250_000_000)).toEqual({ div: 100_000_000, unit: 'млн' });
    });

    it('rounds only the top of a bar', () => {
        const d = topRoundedBar(10, 20, 24, 100);
        expect(d.startsWith('M10,120')).toBe(true);   // square baseline corner
        expect(d).toContain('Q10,20 14,20');            // rounded top-left
        expect(topRoundedBar(0, 0, 24, 0)).toBe('');
    });
});
