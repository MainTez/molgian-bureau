import { HATCH_RATES_MYTHIC_EGG, HATCH_RATES_NORMAL } from './gameConfig.js';
import type { FishRarity } from './gameConfig.js';
import { FISH_RARITY_BASE_WEIGHTS, ROD_CONFIG } from './gameConfig.js';
import type { Rarity, RodTier } from '../db/schema.js';
import { weightedPick } from '../utils/random.js';

const FISH_RARITY_ORDER: FishRarity[] = ['Trash', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'God'];
const PET_RARITY_ORDER: Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

export const rollHatchRarity = (isMythicEgg: boolean): Rarity => {
  const source = isMythicEgg ? HATCH_RATES_MYTHIC_EGG : HATCH_RATES_NORMAL;
  return weightedPick(source.map((entry) => ({ item: entry.rarity, weight: entry.weight })));
};

export const rollChance = (chance: number): boolean => {
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return Math.random() < chance;
};

export const rollFishRarity = (rodTier: RodTier, trashRemoved: boolean): FishRarity => {
  const rod = ROD_CONFIG[rodTier];
  const weights: Array<{ item: FishRarity; weight: number }> = [];
  for (const [rarity, baseWeight] of Object.entries(FISH_RARITY_BASE_WEIGHTS) as Array<
    [FishRarity, number]
  >) {
    if (trashRemoved && rarity === 'Trash') continue;
    const weight = rarity === 'Trash' ? baseWeight * rod.trashWeightMultiplier : baseWeight;
    if (weight > 0) {
      weights.push({ item: rarity, weight });
    }
  }
  return weightedPick(weights);
};

export const bumpFishRarity = (rarity: FishRarity): FishRarity => {
  const index = FISH_RARITY_ORDER.indexOf(rarity);
  if (index < 0 || index === FISH_RARITY_ORDER.length - 1) return rarity;
  return FISH_RARITY_ORDER[index + 1]!;
};

export const bumpPetRarity = (rarity: Rarity): Rarity => {
  const index = PET_RARITY_ORDER.indexOf(rarity);
  if (index < 0 || index === PET_RARITY_ORDER.length - 1) return rarity;
  return PET_RARITY_ORDER[index + 1]!;
};
