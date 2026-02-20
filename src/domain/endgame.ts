import { randomIntInclusive } from '../utils/time.js';

export type BaseClassKey =
  | 'bureau_enforcer'
  | 'shadow_clerk'
  | 'relic_engineer'
  | 'abyss_angler'
  | 'chaos_oracle';

export type T2PathKey =
  | 'debt_crusher'
  | 'riot_marshal'
  | 'vault_warden'
  | 'bribe_broker'
  | 'blackfile_agent'
  | 'contraband_auditor'
  | 'scrap_smith'
  | 'rod_savant'
  | 'arc_forgewright'
  | 'tide_hunter'
  | 'leviathan_caller'
  | 'depth_reaper'
  | 'probability_hacker'
  | 'egg_prophet'
  | 'cataclysm_scribe';

export type T3SpecKey =
  | 'debt_executioner'
  | 'crowd_sovereign'
  | 'vault_juggernaut'
  | 'underworld_cfo'
  | 'archive_reaper'
  | 'smuggling_kingpin'
  | 'molten_overseer'
  | 'abyssal_tackle_lord'
  | 'singularity_mechanic'
  | 'breaker_of_tides'
  | 'abyss_monarch'
  | 'hadal_extinguisher'
  | 'fate_cheater'
  | 'ovum_architect'
  | 'cataclysmic_arbiter';

export type ClassQuizStyle = 'aggressive' | 'defensive' | 'trickster' | 'support' | 'balanced';
export type ClassQuizGoal = 'wealth' | 'raids' | 'fishing' | 'events' | 'hybrid';
export type ClassQuizVibe = 'lawful' | 'chaotic' | 'mystic' | 'tech' | 'hunter';

export type GearSlot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'relic';
export type GearRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'God';
export type MaterialKey = 'scrap' | 'core' | 'prism' | 'void_alloy' | 'boss_core';
export type ShopMaterialKey = Exclude<MaterialKey, 'boss_core'>;
export type ShopCategory = 'weapons' | 'armor' | 'materials' | 'rods' | 'jobs';
export type RaidDifficultyKey = 'normal' | 'hard' | 'nightmare' | 'infernal';

export interface StatLine {
  power: number;
  guard: number;
  crit: number;
  haste: number;
  precision: number;
  resolve: number;
  yield: number;
  scavenge: number;
  luckControl: number;
}

const zeroStats: StatLine = {
  power: 0,
  guard: 0,
  crit: 0,
  haste: 0,
  precision: 0,
  resolve: 0,
  yield: 0,
  scavenge: 0,
  luckControl: 0
};

export interface ClassPathDefinition {
  key: T2PathKey;
  name: string;
  description: string;
  t3Key: T3SpecKey;
  t3Name: string;
  weights: StatLine;
}

export interface BaseClassDefinition {
  key: BaseClassKey;
  name: string;
  description: string;
  setName: string;
  setPrefix: string;
  paths: [ClassPathDefinition, ClassPathDefinition, ClassPathDefinition];
}

export const STARTER_CLASS_COST = 2_500;
export const CLASS_RESET_COST = 250_000;
export const RAID_LOBBY_WINDOW_MS = 2 * 60 * 1000;
export const RAID_COOLDOWN_MS = 30 * 60 * 1000;
export const RAID_MIN_PARTY_SIZE = 2;
export const RAID_MAX_PARTY_SIZE = 6;

const makeWeights = (stats: Partial<StatLine>): StatLine => ({
  ...zeroStats,
  ...stats
});

export const BASE_CLASS_DEFINITIONS: BaseClassDefinition[] = [
  {
    key: 'bureau_enforcer',
    name: 'Bureau Enforcer',
    description: 'Frontline bruisers that turn Molgium disputes into solved problems.',
    setName: 'Vaultbreaker Regalia',
    setPrefix: 'Vaultbreaker',
    paths: [
      {
        key: 'debt_crusher',
        name: 'Debt Crusher',
        description: 'Heavy pressure specialist for durable clear speed.',
        t3Key: 'debt_executioner',
        t3Name: 'Debt Executioner',
        weights: makeWeights({ power: 12, guard: 10, resolve: 6, yield: 3 })
      },
      {
        key: 'riot_marshal',
        name: 'Riot Marshal',
        description: 'Crowd control anchor for chaotic encounters.',
        t3Key: 'crowd_sovereign',
        t3Name: 'Crowd Sovereign',
        weights: makeWeights({ guard: 14, resolve: 10, haste: 5, power: 7 })
      },
      {
        key: 'vault_warden',
        name: 'Vault Warden',
        description: 'Defensive commander focused on team survival.',
        t3Key: 'vault_juggernaut',
        t3Name: 'Vault Juggernaut',
        weights: makeWeights({ guard: 16, resolve: 12, scavenge: 4, luckControl: 3 })
      }
    ]
  },
  {
    key: 'shadow_clerk',
    name: 'Shadow Clerk',
    description: 'Backroom operators who win through manipulation and precision.',
    setName: 'Blackfile Vestments',
    setPrefix: 'Blackfile',
    paths: [
      {
        key: 'bribe_broker',
        name: 'Bribe Broker',
        description: 'Economy pressure specialist with payout control.',
        t3Key: 'underworld_cfo',
        t3Name: 'Underworld CFO',
        weights: makeWeights({ precision: 10, yield: 11, luckControl: 9, haste: 4 })
      },
      {
        key: 'blackfile_agent',
        name: 'Blackfile Agent',
        description: 'Information assassin path for aggressive crit scaling.',
        t3Key: 'archive_reaper',
        t3Name: 'Archive Reaper',
        weights: makeWeights({ crit: 14, precision: 10, haste: 8, power: 6 })
      },
      {
        key: 'contraband_auditor',
        name: 'Contraband Auditor',
        description: 'Loot efficiency specialist with raid utility.',
        t3Key: 'smuggling_kingpin',
        t3Name: 'Smuggling Kingpin',
        weights: makeWeights({ scavenge: 12, yield: 8, precision: 8, resolve: 5, power: 4 })
      }
    ]
  },
  {
    key: 'relic_engineer',
    name: 'Relic Engineer',
    description: 'Gear and artifact experts that maximize crafted power.',
    setName: 'Arcforge Harness',
    setPrefix: 'Arcforge',
    paths: [
      {
        key: 'scrap_smith',
        name: 'Scrap Smith',
        description: 'Material converter built for salvage efficiency.',
        t3Key: 'molten_overseer',
        t3Name: 'Molten Overseer',
        weights: makeWeights({ scavenge: 14, guard: 8, resolve: 8, yield: 6 })
      },
      {
        key: 'rod_savant',
        name: 'Rod Savant',
        description: 'Hybrid fisher path with balanced raid value.',
        t3Key: 'abyssal_tackle_lord',
        t3Name: 'Abyssal Tackle Lord',
        weights: makeWeights({ precision: 9, haste: 9, yield: 7, scavenge: 8, power: 5 })
      },
      {
        key: 'arc_forgewright',
        name: 'Arc Forgewright',
        description: 'High-voltage builder focused on burst power.',
        t3Key: 'singularity_mechanic',
        t3Name: 'Singularity Mechanic',
        weights: makeWeights({ power: 12, crit: 10, haste: 9, luckControl: 4 })
      }
    ]
  },
  {
    key: 'abyss_angler',
    name: 'Abyss Angler',
    description: 'Relentless hunters that thrive in long raid chains.',
    setName: 'Tideborn Huntset',
    setPrefix: 'Tideborn',
    paths: [
      {
        key: 'tide_hunter',
        name: 'Tide Hunter',
        description: 'Versatile hunter tuned for consistent output.',
        t3Key: 'breaker_of_tides',
        t3Name: 'Breaker of Tides',
        weights: makeWeights({ power: 10, precision: 10, guard: 7, haste: 7, yield: 4 })
      },
      {
        key: 'leviathan_caller',
        name: 'Leviathan Caller',
        description: 'Boss-focused striker for high encounter pressure.',
        t3Key: 'abyss_monarch',
        t3Name: 'Abyss Monarch',
        weights: makeWeights({ power: 14, crit: 11, precision: 7, resolve: 6 })
      },
      {
        key: 'depth_reaper',
        name: 'Depth Reaper',
        description: 'Execution path built for finishing dangerous waves.',
        t3Key: 'hadal_extinguisher',
        t3Name: 'Hadal Extinguisher',
        weights: makeWeights({ crit: 13, haste: 10, power: 8, luckControl: 5 })
      }
    ]
  },
  {
    key: 'chaos_oracle',
    name: 'Chaos Oracle',
    description: 'Probability manipulators that weaponize uncertainty.',
    setName: 'Cataclysm Veil',
    setPrefix: 'Cataclysm',
    paths: [
      {
        key: 'probability_hacker',
        name: 'Probability Hacker',
        description: 'Controlled RNG specialist for high-variance raids.',
        t3Key: 'fate_cheater',
        t3Name: 'Fate Cheater',
        weights: makeWeights({ luckControl: 15, crit: 9, haste: 8, precision: 5 })
      },
      {
        key: 'egg_prophet',
        name: 'Egg Prophet',
        description: 'Reward-focused oracle with event bonuses.',
        t3Key: 'ovum_architect',
        t3Name: 'Ovum Architect',
        weights: makeWeights({ yield: 10, luckControl: 11, resolve: 8, scavenge: 7 })
      },
      {
        key: 'cataclysm_scribe',
        name: 'Cataclysm Scribe',
        description: 'Ritual caster path for scaling raid pressure.',
        t3Key: 'cataclysmic_arbiter',
        t3Name: 'Cataclysmic Arbiter',
        weights: makeWeights({ power: 11, haste: 9, luckControl: 10, resolve: 7, crit: 5 })
      }
    ]
  }
];

export const baseClassByKey = (key: BaseClassKey): BaseClassDefinition | undefined =>
  BASE_CLASS_DEFINITIONS.find((entry) => entry.key === key);

export const t2PathByKey = (
  baseClassKey: BaseClassKey,
  pathKey: T2PathKey
): ClassPathDefinition | undefined =>
  baseClassByKey(baseClassKey)?.paths.find((entry) => entry.key === pathKey);

const addQuizScore = (
  score: Record<BaseClassKey, number>,
  targets: BaseClassKey[],
  points: number
): void => {
  for (const target of targets) {
    score[target] += points;
  }
};

export const runClassQuiz = (
  style: ClassQuizStyle,
  goal: ClassQuizGoal,
  vibe: ClassQuizVibe
): { recommended: BaseClassDefinition; score: Record<BaseClassKey, number> } => {
  const score: Record<BaseClassKey, number> = {
    bureau_enforcer: 0,
    shadow_clerk: 0,
    relic_engineer: 0,
    abyss_angler: 0,
    chaos_oracle: 0
  };

  if (style === 'aggressive') addQuizScore(score, ['bureau_enforcer', 'abyss_angler'], 4);
  if (style === 'defensive') addQuizScore(score, ['bureau_enforcer', 'relic_engineer'], 4);
  if (style === 'trickster') addQuizScore(score, ['shadow_clerk', 'chaos_oracle'], 4);
  if (style === 'support') addQuizScore(score, ['relic_engineer', 'chaos_oracle'], 4);
  if (style === 'balanced') addQuizScore(score, ['abyss_angler', 'relic_engineer'], 3);

  if (goal === 'wealth') addQuizScore(score, ['shadow_clerk', 'chaos_oracle'], 4);
  if (goal === 'raids') addQuizScore(score, ['bureau_enforcer', 'abyss_angler'], 4);
  if (goal === 'fishing') addQuizScore(score, ['abyss_angler', 'relic_engineer'], 4);
  if (goal === 'events') addQuizScore(score, ['chaos_oracle', 'shadow_clerk'], 4);
  if (goal === 'hybrid') addQuizScore(score, ['relic_engineer', 'bureau_enforcer'], 3);

  if (vibe === 'lawful') addQuizScore(score, ['bureau_enforcer'], 4);
  if (vibe === 'chaotic') addQuizScore(score, ['shadow_clerk', 'chaos_oracle'], 4);
  if (vibe === 'mystic') addQuizScore(score, ['chaos_oracle'], 5);
  if (vibe === 'tech') addQuizScore(score, ['relic_engineer'], 5);
  if (vibe === 'hunter') addQuizScore(score, ['abyss_angler'], 5);

  const recommendedKey = (Object.keys(score) as BaseClassKey[]).sort(
    (a, b) => score[b] - score[a] || a.localeCompare(b)
  )[0] ?? 'bureau_enforcer';

  return {
    recommended: baseClassByKey(recommendedKey) ?? BASE_CLASS_DEFINITIONS[0]!,
    score
  };
};

const stat = (key: keyof StatLine, min: number, max: number): { key: keyof StatLine; min: number; max: number } => ({
  key,
  min,
  max
});

export interface GearShopOffer {
  id: string;
  name: string;
  category: 'weapons' | 'armor';
  slot: GearSlot;
  rarity: GearRarity;
  price: number;
  classAffinity?: BaseClassKey;
  statRanges: Array<{ key: keyof StatLine; min: number; max: number }>;
}

export interface GearRecipe {
  id: string;
  setKey: string;
  setName: string;
  itemName: string;
  slot: GearSlot;
  rarity: GearRarity;
  classAffinity: BaseClassKey;
  fee: number;
  materials: Record<MaterialKey, number>;
  statRanges: Array<{ key: keyof StatLine; min: number; max: number }>;
}

export const MATERIAL_KEYS: readonly MaterialKey[] = ['scrap', 'core', 'prism', 'void_alloy', 'boss_core'];
export const SHOP_MATERIAL_KEYS: readonly ShopMaterialKey[] = ['scrap', 'core', 'prism', 'void_alloy'];

export const MATERIAL_SHOP_PRICES: Record<ShopMaterialKey, number> = {
  scrap: 300,
  core: 1_500,
  prism: 6_000,
  void_alloy: 20_000
};

export const GEAR_SHOP_OFFERS: GearShopOffer[] = [
  {
    id: 'weapon_bureau_baton',
    name: 'Ledgerbreak Baton',
    category: 'weapons',
    slot: 'weapon',
    rarity: 'Common',
    price: 2_200,
    classAffinity: 'bureau_enforcer',
    statRanges: [stat('power', 16, 24), stat('guard', 8, 14), stat('resolve', 4, 8)]
  },
  {
    id: 'weapon_shadow_stiletto',
    name: 'Blacknote Stiletto',
    category: 'weapons',
    slot: 'weapon',
    rarity: 'Rare',
    price: 8_200,
    classAffinity: 'shadow_clerk',
    statRanges: [stat('crit', 10, 18), stat('precision', 8, 14), stat('haste', 6, 11)]
  },
  {
    id: 'weapon_arc_wrench',
    name: 'Arcweld Wrench',
    category: 'weapons',
    slot: 'weapon',
    rarity: 'Rare',
    price: 9_500,
    classAffinity: 'relic_engineer',
    statRanges: [stat('power', 12, 18), stat('scavenge', 6, 12), stat('resolve', 8, 13)]
  },
  {
    id: 'weapon_tide_harpoon',
    name: 'Tidecarver Harpoon',
    category: 'weapons',
    slot: 'weapon',
    rarity: 'Epic',
    price: 32_000,
    classAffinity: 'abyss_angler',
    statRanges: [stat('power', 22, 32), stat('precision', 12, 20), stat('crit', 8, 15)]
  },
  {
    id: 'weapon_chaos_tome',
    name: 'Variance Grimoire',
    category: 'weapons',
    slot: 'weapon',
    rarity: 'Epic',
    price: 36_000,
    classAffinity: 'chaos_oracle',
    statRanges: [stat('luckControl', 14, 22), stat('haste', 10, 18), stat('yield', 8, 14)]
  },
  {
    id: 'armor_vault_helm',
    name: 'Vaultplate Helm',
    category: 'armor',
    slot: 'helmet',
    rarity: 'Common',
    price: 1_800,
    classAffinity: 'bureau_enforcer',
    statRanges: [stat('guard', 10, 16), stat('resolve', 4, 8)]
  },
  {
    id: 'armor_blackfile_coat',
    name: 'Blackfile Coat',
    category: 'armor',
    slot: 'chest',
    rarity: 'Rare',
    price: 9_200,
    classAffinity: 'shadow_clerk',
    statRanges: [stat('precision', 8, 13), stat('crit', 6, 12), stat('yield', 4, 9)]
  },
  {
    id: 'armor_arcforge_gloves',
    name: 'Arcforge Gloves',
    category: 'armor',
    slot: 'gloves',
    rarity: 'Rare',
    price: 8_600,
    classAffinity: 'relic_engineer',
    statRanges: [stat('scavenge', 8, 14), stat('haste', 4, 10), stat('guard', 4, 9)]
  },
  {
    id: 'armor_tideborn_greaves',
    name: 'Tideborn Greaves',
    category: 'armor',
    slot: 'boots',
    rarity: 'Epic',
    price: 27_000,
    classAffinity: 'abyss_angler',
    statRanges: [stat('haste', 12, 18), stat('precision', 8, 14), stat('power', 7, 12)]
  },
  {
    id: 'armor_cataclysm_relic',
    name: 'Cataclysm Sigil',
    category: 'armor',
    slot: 'relic',
    rarity: 'Legendary',
    price: 96_000,
    classAffinity: 'chaos_oracle',
    statRanges: [stat('luckControl', 18, 26), stat('resolve', 12, 18), stat('yield', 10, 16)]
  }
];

const slotPieceName: Record<GearSlot, string> = {
  weapon: 'Armament',
  helmet: 'Helm',
  chest: 'Cuirass',
  gloves: 'Grips',
  boots: 'Greaves',
  relic: 'Sigil'
};

const slotMaterialCost: Record<GearSlot, Record<MaterialKey, number>> = {
  weapon: { scrap: 12, core: 4, prism: 3, void_alloy: 2, boss_core: 1 },
  helmet: { scrap: 8, core: 3, prism: 2, void_alloy: 1, boss_core: 1 },
  chest: { scrap: 10, core: 4, prism: 3, void_alloy: 2, boss_core: 1 },
  gloves: { scrap: 7, core: 3, prism: 2, void_alloy: 1, boss_core: 1 },
  boots: { scrap: 7, core: 3, prism: 2, void_alloy: 1, boss_core: 1 },
  relic: { scrap: 6, core: 4, prism: 3, void_alloy: 2, boss_core: 1 }
};

const slotFeeCost: Record<GearSlot, number> = {
  weapon: 18_000,
  helmet: 13_000,
  chest: 16_000,
  gloves: 12_000,
  boots: 12_000,
  relic: 21_000
};

const slotRanges = (weights: StatLine, slot: GearSlot): Array<{ key: keyof StatLine; min: number; max: number }> => {
  const slotBoost =
    slot === 'weapon' ? 1.2 : slot === 'chest' ? 1.15 : slot === 'relic' ? 1.25 : 1.0;
  const ranges: Array<{ key: keyof StatLine; min: number; max: number }> = [];
  for (const [key, value] of Object.entries(weights) as Array<[keyof StatLine, number]>) {
    if (value <= 0) continue;
    const min = Math.max(1, Math.floor(value * 0.65 * slotBoost));
    const max = Math.max(min + 1, Math.ceil(value * 1.15 * slotBoost));
    ranges.push({ key, min, max });
  }
  return ranges;
};

const baseRecipeWeights = (base: BaseClassDefinition): StatLine => {
  const totals: StatLine = { ...zeroStats };
  for (const path of base.paths) {
    for (const [key, value] of Object.entries(path.weights) as Array<[keyof StatLine, number]>) {
      totals[key] += value;
    }
  }
  const averaged: StatLine = { ...zeroStats };
  for (const [key, value] of Object.entries(totals) as Array<[keyof StatLine, number]>) {
    averaged[key] = value > 0 ? Math.max(1, Math.round(value / base.paths.length)) : 0;
  }
  return averaged;
};

export const BOSS_GEAR_RECIPES: GearRecipe[] = BASE_CLASS_DEFINITIONS.flatMap((base) =>
  (Object.keys(slotPieceName) as GearSlot[]).map((slot) => ({
    id: `forge_${base.key}_${slot}`,
    setKey: `set_${base.key}`,
    setName: base.setName,
    itemName: `${base.setPrefix} ${slotPieceName[slot]}`,
    slot,
    rarity: slot === 'weapon' || slot === 'relic' ? 'Mythic' : 'Legendary',
    classAffinity: base.key,
    fee: slotFeeCost[slot],
    materials: slotMaterialCost[slot],
    statRanges: slotRanges(baseRecipeWeights(base), slot)
  }))
);

export const rollStatsFromRanges = (
  ranges: Array<{ key: keyof StatLine; min: number; max: number }>
): StatLine => {
  const rolled: StatLine = { ...zeroStats };
  for (const range of ranges) {
    rolled[range.key] = randomIntInclusive(range.min, range.max);
  }
  return rolled;
};

export interface RaidDifficultyConfig {
  key: RaidDifficultyKey;
  label: string;
  enemyHpMultiplier: number;
  payoutMin: number;
  payoutMax: number;
  eggDropChance: number;
  bossCoreDropChance: number;
  materialMultiplier: number;
}

export const RAID_DIFFICULTIES: Record<RaidDifficultyKey, RaidDifficultyConfig> = {
  normal: {
    key: 'normal',
    label: 'Normal',
    enemyHpMultiplier: 1,
    payoutMin: 450,
    payoutMax: 750,
    eggDropChance: 0.04,
    bossCoreDropChance: 0.18,
    materialMultiplier: 1
  },
  hard: {
    key: 'hard',
    label: 'Hard',
    enemyHpMultiplier: 1.35,
    payoutMin: 850,
    payoutMax: 1_350,
    eggDropChance: 0.08,
    bossCoreDropChance: 0.3,
    materialMultiplier: 1.25
  },
  nightmare: {
    key: 'nightmare',
    label: 'Nightmare',
    enemyHpMultiplier: 1.8,
    payoutMin: 1_450,
    payoutMax: 2_250,
    eggDropChance: 0.13,
    bossCoreDropChance: 0.44,
    materialMultiplier: 1.6
  },
  infernal: {
    key: 'infernal',
    label: 'Infernal',
    enemyHpMultiplier: 2.35,
    payoutMin: 2_400,
    payoutMax: 3_600,
    eggDropChance: 0.2,
    bossCoreDropChance: 0.6,
    materialMultiplier: 2
  }
};

export type RaidBossKey =
  | 'collector_prime'
  | 'harbormaw_tyrant'
  | 'audit_archon'
  | 'null_leviathan'
  | 'cataclysm_regent';

export interface RaidBossDefinition {
  key: RaidBossKey;
  name: string;
  portrait: string;
}

export const RAID_BOSSES: RaidBossDefinition[] = [
  { key: 'collector_prime', name: 'Collector Prime', portrait: '🧾' },
  { key: 'harbormaw_tyrant', name: 'Harbormaw Tyrant', portrait: '🦈' },
  { key: 'audit_archon', name: 'Audit Archon', portrait: '⚖️' },
  { key: 'null_leviathan', name: 'Null Leviathan', portrait: '🌊' },
  { key: 'cataclysm_regent', name: 'Cataclysm Regent', portrait: '☄️' }
];

export interface RaidEncounter {
  key: string;
  kind: 'npc' | 'elite' | 'boss';
  name: string;
  portrait: string;
  hpBase: number;
  modifier: string;
}

const npcPool: RaidEncounter[] = [
  { key: 'npc_debt_runners', kind: 'npc', name: 'Debt Runners', portrait: '🗡️', hpBase: 430, modifier: 'Fast Entry' },
  { key: 'npc_tide_cutters', kind: 'npc', name: 'Tide Cutters', portrait: '🪝', hpBase: 460, modifier: 'Armor Chips' },
  { key: 'npc_blackfile_hounds', kind: 'npc', name: 'Blackfile Hounds', portrait: '📁', hpBase: 520, modifier: 'Crit Pressure' },
  { key: 'npc_arc_saboteurs', kind: 'npc', name: 'Arc Saboteurs', portrait: '⚙️', hpBase: 500, modifier: 'Shock Sparks' },
  { key: 'npc_hadal_reclaimers', kind: 'npc', name: 'Hadal Reclaimers', portrait: '🌫️', hpBase: 550, modifier: 'Resolve Drain' }
];

const elitePool: RaidEncounter[] = [
  { key: 'elite_deep_bailiff', kind: 'elite', name: 'Deep Bailiff', portrait: '🛡️', hpBase: 780, modifier: 'Punitive Aura' },
  { key: 'elite_abyss_inspector', kind: 'elite', name: 'Abyss Inspector', portrait: '🧪', hpBase: 840, modifier: 'Instability Pulse' },
  { key: 'elite_vault_ghoul', kind: 'elite', name: 'Vault Ghoul', portrait: '🔒', hpBase: 920, modifier: 'Shielded Burst' }
];

const mutatorPool = [
  'Low Visibility',
  'Corrupted Waters',
  'Overclocked Defenders',
  'High Tax Field',
  'Greedy Spirits'
];

const pickNonRepeating = <T extends { key: string }>(pool: T[], blocked: Set<string>): T => {
  if (pool.length === 0) {
    throw new Error('Encounter pool must not be empty');
  }
  const candidates = pool.filter((entry) => !blocked.has(entry.key));
  const source = candidates.length > 0 ? candidates : pool;
  return source[randomIntInclusive(0, source.length - 1)]!;
};

export const generateRaidEncounters = (
  bossKey: RaidBossKey,
  recentEncounterKeys: string[]
): { stages: RaidEncounter[]; mutator: string } => {
  const boss =
    RAID_BOSSES.find((entry) => entry.key === bossKey) ??
    RAID_BOSSES[0] ?? { key: 'collector_prime', name: 'Collector Prime', portrait: '🧾' };
  const stageCount = randomIntInclusive(3, 5);
  const blocked = new Set(recentEncounterKeys.slice(-6));
  const stages: RaidEncounter[] = [];
  for (let stage = 1; stage < stageCount; stage += 1) {
    const shouldUseElite = stage === stageCount - 1 && Math.random() < 0.7;
    const picked = shouldUseElite ? pickNonRepeating(elitePool, blocked) : pickNonRepeating(npcPool, blocked);
    blocked.add(picked.key);
    stages.push(picked);
  }
  stages.push({
    key: boss.key,
    kind: 'boss',
    name: boss.name,
    portrait: boss.portrait,
    hpBase: 1_400,
    modifier: 'Boss Phase'
  });
  return {
    stages,
    mutator: mutatorPool[randomIntInclusive(0, mutatorPool.length - 1)] ?? 'No Mutator'
  };
};

export const formatStats = (stats: StatLine): string =>
  [
    `PWR ${stats.power}`,
    `GRD ${stats.guard}`,
    `CRT ${stats.crit}`,
    `HST ${stats.haste}`,
    `PRC ${stats.precision}`,
    `RSV ${stats.resolve}`,
    `YLD ${stats.yield}`,
    `SCV ${stats.scavenge}`,
    `LCK ${stats.luckControl}`
  ].join(' | ');

export const emptyStats = (): StatLine => ({ ...zeroStats });

export const rarityMultiplier = (rarity: GearRarity): number => {
  if (rarity === 'Common') return 1;
  if (rarity === 'Rare') return 1.18;
  if (rarity === 'Epic') return 1.4;
  if (rarity === 'Legendary') return 1.72;
  if (rarity === 'Mythic') return 2.08;
  return 2.65;
};
