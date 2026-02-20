import { describe, expect, it } from 'vitest';
import {
  BOSS_GEAR_RECIPES,
  BASE_CLASS_DEFINITIONS,
  RAID_DEBT_MIN_BALANCE,
  RAID_ENTRY_FEES,
  MATERIAL_SHOP_PRICES,
  clampRaidChargeWithDebtFloor,
  generateRaidEncounters,
  raidWipePenalty,
  splitRaidSink,
  rollStatsFromRanges,
  runClassQuiz
} from '../src/domain/endgame.js';

describe('endgame domain', () => {
  it('class quiz always returns a valid base class recommendation', () => {
    const result = runClassQuiz('balanced', 'hybrid', 'tech');
    const keys = new Set(BASE_CLASS_DEFINITIONS.map((entry) => entry.key));
    expect(keys.has(result.recommended.key)).toBe(true);
  });

  it('raid encounter generator builds 3-5 staged runs ending with boss', () => {
    const generated = generateRaidEncounters('collector_prime', ['npc_debt_runners']);
    expect(generated.stages.length).toBeGreaterThanOrEqual(3);
    expect(generated.stages.length).toBeLessThanOrEqual(5);
    expect(generated.stages.at(-1)?.kind).toBe('boss');
    expect(generated.mutator.length).toBeGreaterThan(0);
  });

  it('boss recipes require boss_core and produce valid stat rolls', () => {
    const firstRecipe = BOSS_GEAR_RECIPES[0]!;
    expect(firstRecipe).toBeDefined();
    expect(firstRecipe.materials.boss_core).toBeGreaterThan(0);
    const rolled = rollStatsFromRanges(firstRecipe.statRanges);
    for (const range of firstRecipe.statRanges) {
      expect(rolled[range.key]).toBeGreaterThanOrEqual(range.min);
      expect(rolled[range.key]).toBeLessThanOrEqual(range.max);
    }
  });

  it('material shop excludes boss_core', () => {
    expect('boss_core' in MATERIAL_SHOP_PRICES).toBe(false);
  });

  it('boss recipe stat ranges are not locked to first path weights', () => {
    const recipe = BOSS_GEAR_RECIPES.find((entry) => entry.id === 'forge_bureau_enforcer_weapon');
    const base = BASE_CLASS_DEFINITIONS.find((entry) => entry.key === 'bureau_enforcer');
    expect(recipe).toBeDefined();
    expect(base).toBeDefined();

    const firstPathPower = base!.paths[0].weights.power;
    const slotBoost = 1.2;
    const firstPathMax = Math.max(2, Math.ceil(firstPathPower * 1.15 * slotBoost));
    const recipePowerRange = recipe!.statRanges.find((range) => range.key === 'power');
    expect(recipePowerRange).toBeDefined();
    expect(recipePowerRange!.max).not.toBe(firstPathMax);
  });

  it('uses expected raid entry fees and wipe penalties', () => {
    expect(RAID_ENTRY_FEES.normal).toBe(500);
    expect(RAID_ENTRY_FEES.hard).toBe(1200);
    expect(RAID_ENTRY_FEES.nightmare).toBe(2500);
    expect(RAID_ENTRY_FEES.infernal).toBe(4500);
    expect(raidWipePenalty('normal')).toBe(250);
    expect(raidWipePenalty('infernal')).toBe(2250);
  });

  it('splits raid sink into treasury + burned halves', () => {
    expect(splitRaidSink(1000)).toEqual({ treasury: 500, burned: 500 });
    expect(splitRaidSink(501)).toEqual({ treasury: 250, burned: 251 });
  });

  it('clamps raid debt charges to configured debt floor', () => {
    const within = clampRaidChargeWithDebtFloor(100, 200);
    expect(within).toEqual({ charged: 200, newBalance: -100, capped: false });

    const capped = clampRaidChargeWithDebtFloor(-9900, 500);
    expect(capped).toEqual({ charged: 100, newBalance: RAID_DEBT_MIN_BALANCE, capped: true });

    const none = clampRaidChargeWithDebtFloor(RAID_DEBT_MIN_BALANCE, 50);
    expect(none).toEqual({ charged: 0, newBalance: RAID_DEBT_MIN_BALANCE, capped: true });
  });
});
