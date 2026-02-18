import { describe, expect, it } from 'vitest';
import { applyTreasuryTransfer } from '../src/domain/economy/treasury.js';
import { calculateJackpotTax } from '../src/domain/gambling/tax.js';
describe('jackpot tax', () => {
    it('applies zero tax below threshold', () => {
        expect(calculateJackpotTax(1999)).toBe(0);
    });
    it('applies tax at threshold and above', () => {
        expect(calculateJackpotTax(2000)).toBe(160);
        expect(calculateJackpotTax(5000)).toBe(400);
    });
});
describe('treasury transfers', () => {
    it('moves funds from wallet to treasury', () => {
        const result = applyTreasuryTransfer(1200, 80, 300);
        expect(result).toEqual({ wallet: 900, treasury: 380 });
    });
    it('rejects overdraft transfers', () => {
        expect(() => applyTreasuryTransfer(100, 0, 101)).toThrow('insufficient wallet funds');
    });
});
