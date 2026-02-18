import { describe, expect, it } from 'vitest';
import { applyTreasuryTransfer } from '../src/domain/economy/treasury.js';
import { calculateJackpotTax } from '../src/domain/gambling/tax.js';
import { rollChance } from '../src/domain/rolls.js';

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

describe('chance rolls', () => {
  it('never triggers when chance is 0', () => {
    expect(rollChance(0)).toBe(false);
    expect(rollChance(-1)).toBe(false);
  });

  it('always triggers when chance is 1 or more', () => {
    expect(rollChance(1)).toBe(true);
    expect(rollChance(2)).toBe(true);
  });
});
