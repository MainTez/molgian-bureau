import { describe, expect, it } from 'vitest';
import { nextEggRescheduleDelayMs, remainingEggWinsToday } from '../src/domain/eggs/scheduling.js';
import { rollHatchRarity } from '../src/domain/rolls.js';

describe('egg scheduling helpers', () => {
  it('tracks remaining daily egg wins from target 6', () => {
    expect(remainingEggWinsToday(0)).toBe(6);
    expect(remainingEggWinsToday(4)).toBe(2);
    expect(remainingEggWinsToday(9)).toBe(0);
  });

  it('reschedule delay stays in configured range', () => {
    for (let i = 0; i < 100; i += 1) {
      const delay = nextEggRescheduleDelayMs();
      expect(delay).toBeGreaterThanOrEqual(30 * 60 * 1000);
      expect(delay).toBeLessThanOrEqual(90 * 60 * 1000);
    }
  });
});

describe('hatch rarity rolls', () => {
  it('always returns valid rarity for normal egg', () => {
    const allowed = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']);
    for (let i = 0; i < 500; i += 1) {
      expect(allowed.has(rollHatchRarity(false))).toBe(true);
    }
  });

  it('always returns valid rarity for mythic egg', () => {
    const allowed = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']);
    for (let i = 0; i < 500; i += 1) {
      expect(allowed.has(rollHatchRarity(true))).toBe(true);
    }
  });
});
