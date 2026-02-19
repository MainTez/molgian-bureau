import type { PetType, Rarity, RodTier } from '../db/schema.js';

export const BOT_NAME = 'Molgian Bureau';
export const CURRENCY_NAME = 'Molgium';
export const DAILY_RESET_HOUR = 6;
export const WORK_ROBBERY_CHANCE = 0.01;
export const TREASURY_DRIP_FISH_SELL_RATE = 0.05;
export const TREASURY_DRIP_GAMBLE_LOSS_RATE = 0.05;
export const WORK_STREAK_BONUS_PER_DAY = 0.03;
export const WORK_STREAK_BONUS_CAP = 0.3;

export const RAISE_TIERS = [
  { id: 1, cost: 500, newSalaryBase: 250 },
  { id: 2, cost: 1000, newSalaryBase: 500 },
  { id: 3, cost: 2000, newSalaryBase: 900 }
] as const;

export const ROD_CONFIG: Record<
  RodTier,
  {
    name: string;
    cost: number;
    trashWeightMultiplier: number;
    sellBonusMultiplier: number;
    doubleSellChance: number;
    rarityBumpChance: number;
  }
> = {
  starter: {
    name: 'Starter Rod',
    cost: 300,
    trashWeightMultiplier: 1,
    sellBonusMultiplier: 1,
    doubleSellChance: 0,
    rarityBumpChance: 0
  },
  improved: {
    name: 'Improved Rod',
    cost: 2000,
    trashWeightMultiplier: 0.8,
    sellBonusMultiplier: 1.08,
    doubleSellChance: 0,
    rarityBumpChance: 0.03
  },
  elite: {
    name: 'Elite Rod',
    cost: 7500,
    trashWeightMultiplier: 0.65,
    sellBonusMultiplier: 1.12,
    doubleSellChance: 0.06,
    rarityBumpChance: 0.07
  }
};

export type FishRarity = Rarity | 'Trash' | 'God';

export const FISH_RARITY_BASE_WEIGHTS: Record<FishRarity, number> = {
  Trash: 38,
  Common: 39,
  Rare: 16,
  Epic: 5,
  Legendary: 1.7,
  Mythic: 0.3,
  God: 0
};

export const FISH_BASE_VALUES: Record<FishRarity, [number, number]> = {
  Trash: [5, 16],
  Common: [18, 45],
  Rare: [50, 130],
  Epic: [160, 360],
  Legendary: [420, 900],
  Mythic: [1200, 2400],
  God: [2600, 5200]
};

export const FISH_SEASONS: Record<
  string,
  Array<{
    key: string;
    rarity: FishRarity;
    displayName: string;
  }>
> = {
  january: [
    { key: 'frost_minnow', rarity: 'Common', displayName: 'Frost Minnow' },
    { key: 'ice_eel', rarity: 'Rare', displayName: 'Ice Eel' },
    { key: 'void_angler', rarity: 'Epic', displayName: 'Void Angler' }
  ],
  february: [
    { key: 'heartfin_guppy', rarity: 'Common', displayName: 'Heartfin Guppy' },
    { key: 'rose_pike', rarity: 'Rare', displayName: 'Rose Pike' },
    { key: 'crystal_sting', rarity: 'Epic', displayName: 'Crystal Sting' }
  ],
  default: [
    { key: 'moss_carp', rarity: 'Common', displayName: 'Moss Carp' },
    { key: 'storm_cod', rarity: 'Rare', displayName: 'Storm Cod' },
    { key: 'ember_koi', rarity: 'Epic', displayName: 'Ember Koi' }
  ]
};

export const SHOP_FIXED_RAISES = RAISE_TIERS;
export const SHOP_FIXED_RODS: RodTier[] = ['starter', 'improved', 'elite'];

export const COSMETIC_POOL = {
  title: [
    { id: 'title_molgian_rookie', name: 'Molgian Rookie', price: 120 },
    { id: 'title_chaos_clerk', name: 'Chaos Clerk', price: 240 },
    { id: 'title_tax_enjoyer', name: 'Tax Enjoyer', price: 400 },
    { id: 'title_bureau_chief', name: 'Bureau Chief', price: 700 }
  ],
  badge: [
    { id: 'badge_green_slime', name: 'Green Slime Badge', price: 120 },
    { id: 'badge_broken_coin', name: 'Broken Coin Badge', price: 220 },
    { id: 'badge_fish_knife', name: 'Fish Knife Badge', price: 320 },
    { id: 'badge_molgium_star', name: 'Molgium Star Badge', price: 520 }
  ],
  frame: [
    { id: 'frame_bureau_steel', name: 'Bureau Steel', price: 220 },
    { id: 'frame_egg_static', name: 'Egg Static', price: 280 },
    { id: 'frame_hall_gold', name: 'Hall Gold', price: 460 },
    { id: 'frame_mythic_fire', name: 'Mythic Fire', price: 920 }
  ]
} as const;

export const ROTATING_SHOP_SIZE = 4;

export const HATCH_RATES_NORMAL: Array<{ rarity: Rarity; weight: number }> = [
  { rarity: 'Common', weight: 75 },
  { rarity: 'Rare', weight: 18 },
  { rarity: 'Epic', weight: 5 },
  { rarity: 'Legendary', weight: 1.5 },
  { rarity: 'Mythic', weight: 0.5 }
];

export const HATCH_RATES_MYTHIC_EGG: Array<{ rarity: Rarity; weight: number }> = [
  { rarity: 'Epic', weight: 2 },
  { rarity: 'Legendary', weight: 49 },
  { rarity: 'Mythic', weight: 49 }
];

export const PET_WORKER_MULTIPLIER: Record<Rarity, number> = {
  Common: 1.05,
  Rare: 1.1,
  Epic: 1.18,
  Legendary: 1.25,
  Mythic: 1.4
};

export const PET_FISHER_BUMP_CHANCE: Record<Rarity, number> = {
  Common: 0.1,
  Rare: 0.15,
  Epic: 0.2,
  Legendary: 0.25,
  Mythic: 0.3
};

export const PET_FISHER_SELL_BONUS: Record<Rarity, number> = {
  Common: 0.04,
  Rare: 0.07,
  Epic: 0.1,
  Legendary: 0.14,
  Mythic: 0.2
};

export const PET_GAMBLER_WIN_BONUS: Record<Rarity, number> = {
  Common: 0.01,
  Rare: 0.02,
  Epic: 0.03,
  Legendary: 0.04,
  Mythic: 0.06
};

export const PET_EVENT_BONUS: Record<Rarity, number> = {
  Common: 40,
  Rare: 65,
  Epic: 95,
  Legendary: 145,
  Mythic: 220
};

export const SHARD_VALUES: Record<Rarity, number> = {
  Common: 1,
  Rare: 3,
  Epic: 10,
  Legendary: 30,
  Mythic: 100
};

export const SELL_VALUES: Record<Rarity, number> = {
  Common: 50,
  Rare: 150,
  Epic: 600,
  Legendary: 2500,
  Mythic: 10000
};

export const FORGE_MYTHIC_EGG_COST = 250;

export const PET_TYPES: PetType[] = ['Worker', 'Fisher', 'Gambler', 'Event'];

export const FISH_COOLDOWN_MS = 15 * 60 * 1000;
export const JACKPOT_COOLDOWN_MS = 15 * 60 * 1000;
export const EGG_EVENT_WINDOW_MS = 2 * 60 * 1000;
export const EGG_RESCHEDULE_MIN_MS = 30 * 60 * 1000;
export const EGG_RESCHEDULE_MAX_MS = 90 * 60 * 1000;

export const MAJOR_EVENT_MIN_MS = 60 * 60 * 1000;
export const MAJOR_EVENT_MAX_MS = 2 * 60 * 60 * 1000;
export const MICRO_EVENT_MIN_MS = 20 * 60 * 1000;
export const MICRO_EVENT_MAX_MS = 40 * 60 * 1000;
export const MAJOR_EVENT_DAILY_CAP = 3;

export const DAILY_EGG_TARGET = 6;

export const JACKPOT_TAX_THRESHOLD = 2000;
export const JACKPOT_TAX_RATE = 0.08;
