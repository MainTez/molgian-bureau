import { describe, expect, it } from 'vitest';
import {
  BOSS_GEAR_RECIPES,
  BASE_CLASS_DEFINITIONS,
  MATERIAL_SHOP_PRICES,
  generateRaidEncounters,
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
});
