import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  type MessageCreateOptions,
  type Guild,
  type GuildMember,
  type Message,
  type Role,
  type TextChannel
} from 'discord.js';
import { and, asc, desc, eq, gte, isNull, like, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { appEnv, getDiscordEnv } from './config/env.js';
import {
  DAILY_EGG_TARGET,
  DAILY_RESET_HOUR,
  EGG_EVENT_WINDOW_MS,
  EGG_RESCHEDULE_MAX_MS,
  EGG_RESCHEDULE_MIN_MS,
  EVENT_GLOBAL_COOLDOWN_MS,
  FISH_RARITY_BASE_WEIGHTS,
  FISH_BASE_VALUES,
  FISH_SEASONS,
  FORGE_MYTHIC_EGG_COST,
  HATCH_RATES_MYTHIC_EGG,
  HATCH_RATES_NORMAL,
  JACKPOT_COOLDOWN_MS,
  MAJOR_EVENT_DAILY_CAP,
  MAJOR_EVENT_MAX_MS,
  MAJOR_EVENT_MIN_MS,
  MICRO_EVENT_MAX_MS,
  MICRO_EVENT_MIN_MS,
  PET_EVENT_BONUS,
  PET_FISHER_BUMP_CHANCE,
  PET_FISHER_SELL_BONUS,
  PET_GAMBLER_WIN_BONUS,
  PET_RAID_LOOT_BONUS_CHANCE,
  PET_RAID_MOLGIUM_WIN_BONUS,
  PET_TYPES,
  PET_WORKER_MULTIPLIER,
  RAISE_TIERS,
  ROD_CONFIG,
  SELL_VALUES,
  SHARD_VALUES,
  TREASURY_DRIP_FISH_SELL_RATE,
  TREASURY_DRIP_GAMBLE_LOSS_RATE,
  WEEKLY_TREASURY_WALLET_TAX_RATE,
  WORK_ROBBERY_CHANCE,
  WORK_STREAK_BONUS_CAP,
  WORK_STREAK_BONUS_PER_DAY,
  type FishRarity
} from './domain/gameConfig.js';
import {
  BASE_CLASS_DEFINITIONS,
  BOSS_GEAR_RECIPES,
  CLASS_RESET_COST,
  GEAR_SHOP_OFFERS,
  MATERIAL_KEYS,
  MATERIAL_SHOP_PRICES,
  RAID_BOSSES,
  RAID_COOLDOWN_MS,
  RAID_DEBT_MIN_BALANCE,
  RAID_DIFFICULTIES,
  RAID_ENTRY_FEES,
  RAID_LOBBY_WINDOW_MS,
  RAID_MAX_PARTY_SIZE,
  RAID_MIN_PARTY_SIZE,
  SHOP_MATERIAL_KEYS,
  STARTER_CLASS_COST,
  baseClassByKey,
  clampRaidChargeWithDebtFloor,
  emptyStats,
  formatStats,
  generateRaidEncounters,
  rarityMultiplier,
  raidWipePenalty,
  rollStatsFromRanges,
  runClassQuiz,
  splitRaidSink,
  t2PathByKey,
  type BaseClassKey,
  type ClassQuizGoal,
  type ClassQuizStyle,
  type ClassQuizVibe,
  type GearRarity,
  type GearSlot,
  type MaterialKey,
  type RaidBossKey,
  type RaidDifficultyKey,
  type ShopCategory,
  type StatLine,
  type T2PathKey
} from './domain/endgame.js';
import { selectMicroEvent } from './domain/events/microEventSelector.js';
import { calculateJackpotTax } from './domain/gambling/tax.js';
import { bumpFishRarity, rollChance, rollFishRarity, rollHatchRarity } from './domain/rolls.js';
import { db } from './db/client.js';
import {
  activePet,
  appState,
  balances,
  craftingMaterials,
  eggsInventory,
  eventRuns,
  fishCatches,
  fishCollection,
  fishHallOfFame,
  gearInstances,
  jackpotEntries,
  jackpotRounds,
  mythicHallOfFame,
  petInstances,
  petsOwned,
  raidLobbies,
  raidLobbyMembers,
  raidRunMembers,
  raidRuns,
  raisesOwned,
  rodsOwned,
  shards,
  treasury,
  userClassProgress,
  userGearEquips,
  wikiPages,
  type PetType,
  type Rarity,
  type RodTier,
  users
} from './db/schema.js';
import { logger } from './utils/logger.js';
import { pickRandom, shuffle, weightedPick } from './utils/random.js';
import { getWorkWindowStart, isSameWorkWindow, nowMs, randomIntInclusive, toDayKey } from './utils/time.js';
import { createBotEmbed } from './discord/embeds.js';
import {
  CITIZENS_ROLE_NAME,
  createCitizensRolePanelPayload,
  RULES_CHANNEL_NAME
} from './discord/citizensRole.js';

const rarityRank: Record<Rarity, number> = {
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
  Mythic: 5
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

type EggGameType = 'speed_type' | 'reaction_lock' | 'emoji_memory' | 'rapid_choice' | 'quick_duel';
type EventName =
  | 'pickpocket'
  | 'claim_rush'
  | 'stimulus_drop'
  | 'tax_audit'
  | 'inflation_spike'
  | 'egg_rate_boost'
  | 'fishing_madness'
  | 'coinflip_chaos'
  | 'egg_spawn';
type MissionPeriod = 'daily' | 'weekly';
type MissionMetric = 'fish_cast' | 'gamble_play' | 'gamble_win' | 'work_claim' | 'fish_sell' | 'hatch';
type MissionDefinition = {
  id: string;
  period: MissionPeriod;
  metric: MissionMetric;
  target: number;
  label: string;
};

type GearSetBonusInfo = {
  mainClassKey: BaseClassKey;
  twoPieceBonus: string;
  fourPieceBonus: string;
};

const speedTypePrompts = [
  'Molgium never sleeps',
  'Special Place supremacy',
  'Bureau chaos approved',
  'No eggs for cowards'
];
const MISSION_SHARD_REWARD_TENTHS = [1, 2, 3, 4, 5] as const;
const MISSION_MOLGIUM_REWARD_RANGE: Record<MissionPeriod, readonly [number, number]> = {
  daily: [50, 150],
  weekly: [300, 700]
};
const MISSION_DEFINITIONS: MissionDefinition[] = [
  { id: 'daily_cast_5', period: 'daily', metric: 'fish_cast', target: 5, label: 'Cast 5 fish' },
  { id: 'daily_gamble_3', period: 'daily', metric: 'gamble_play', target: 3, label: 'Play 3 gambles' },
  { id: 'daily_work_1', period: 'daily', metric: 'work_claim', target: 1, label: 'Use /work once' },
  { id: 'weekly_sell_40', period: 'weekly', metric: 'fish_sell', target: 40, label: 'Sell 40 fish' },
  { id: 'weekly_hatch_8', period: 'weekly', metric: 'hatch', target: 8, label: 'Hatch 8 eggs' },
  {
    id: 'weekly_gamble_win_12',
    period: 'weekly',
    metric: 'gamble_win',
    target: 12,
    label: 'Win 12 gambles'
  }
];
const gearSetBonuses: Record<string, GearSetBonusInfo> = {
  set_bureau_enforcer: {
    mainClassKey: 'bureau_enforcer',
    twoPieceBonus: '+18% raid guard and +8% raid power.',
    fourPieceBonus: '+30% riot pressure when your T3 specialization is active.'
  },
  set_shadow_clerk: {
    mainClassKey: 'shadow_clerk',
    twoPieceBonus: '+14% precision and +12% crit conversion.',
    fourPieceBonus: '+26% payout manipulation for your locked specialization.'
  },
  set_relic_engineer: {
    mainClassKey: 'relic_engineer',
    twoPieceBonus: '+16% scavenge and +10% resolve.',
    fourPieceBonus: '+28% forge efficiency and raid utility output.'
  },
  set_abyss_angler: {
    mainClassKey: 'abyss_angler',
    twoPieceBonus: '+15% power and +12% haste.',
    fourPieceBonus: '+27% boss damage conversion for your specialization.'
  },
  set_chaos_oracle: {
    mainClassKey: 'chaos_oracle',
    twoPieceBonus: '+15% luck control and +10% yield.',
    fourPieceBonus: '+29% encounter volatility leverage.'
  }
};
const claimWords = ['MOLGIUM', 'BUREAU', 'HATCH', 'CHAOS', 'ROD'];
const emojiPool = ['🐟', '🥚', '💰', '🔥', '⭐', '🧪', '🧿', '🫧'];
const fishNameWords = [
  'swashbuckler',
  'wavebreaker',
  'driftknight',
  'depthrunner',
  'stormtail',
  'moonfin',
  'ironhook',
  'saltfang',
  'reefblade',
  'frostgill'
];
const creatureNameSuffixWords = [
  'shadow',
  'ember',
  'ripple',
  'breeze',
  'fang',
  'spark',
  'moss',
  'nova',
  'drift',
  'blitz'
];
const legendaryFishNamePrefixes = ['Storm', 'Abyss', 'Iron', 'Night', 'Frost', 'Ember', 'Dread', 'Tide'];
const legendaryFishNameCores = ['fang', 'maw', 'fin', 'scale', 'rider', 'seer', 'warden', 'reaver'];
const mythicFishNamePrefixes = ['Voidborn', 'Astral', 'Titan', 'Eternal', 'Leviathan', 'Celestial', 'Runic'];
const mythicFishNameCores = ['Sovereign', 'Oracle', 'Emperor', 'Colossus', 'Monarch', 'Prime'];
const godFishNamePrefixes = ['Apex', 'Divine', 'Omega', 'Eclipse', 'Ascendant', 'Immortal', 'Unbound'];
const godFishNameCores = ['Leviathan', 'Paragon', 'Overlord', 'Titan', 'Archon', 'Mythos', 'Dominion'];
const commonFishNamePrefixes = ['plain', 'basic', 'normal', 'average', 'dull', 'boring', 'regular', 'okay'];
const commonFishNameCores = ['fish', 'catch', 'swimmer', 'thing', 'one', 'blob', 'guy', 'specimen'];
const trashFallbackPool: Array<{ key: string; displayName: string; rarity: FishRarity }> = [
  { key: 'rusted_junk', displayName: 'Rusted Junk', rarity: 'Trash' },
  { key: 'tangled_boot', displayName: 'Tangled Boot', rarity: 'Trash' }
];
type FishEnchantment = {
  key: string;
  label: string;
  chance: number;
  valueMultiplier: number;
};
const fishEnchantments: FishEnchantment[] = [
  { key: 'small', label: 'Small', chance: 0.002, valueMultiplier: 0.88 },
  { key: 'giant', label: 'Giant', chance: 0.0018, valueMultiplier: 1.75 },
  { key: 'gold', label: 'Gold', chance: 0.0008, valueMultiplier: 2.4 },
  { key: 'neon', label: 'Neon', chance: 0.00055, valueMultiplier: 3.1 },
  { key: 'rainbow', label: 'Rainbow', chance: 0.00035, valueMultiplier: 3.9 },
  { key: 'voidtouched', label: 'Voidtouched', chance: 0.0002, valueMultiplier: 4.8 },
  { key: 'crowned', label: 'Crowned', chance: 0.00012, valueMultiplier: 6.5 }
];

interface ActiveEggState {
  runId: number;
  type: EggGameType;
}

const generateCreatureName = (): string =>
  `${pickRandom(fishNameWords)} ${pickRandom(creatureNameSuffixWords)}`;

const generateEliteFishName = (rarity: FishRarity): string => {
  if (rarity === 'God') {
    return `${pickRandom(godFishNamePrefixes)} ${pickRandom(godFishNameCores)}`;
  }
  if (rarity === 'Mythic') {
    return `${pickRandom(mythicFishNamePrefixes)} ${pickRandom(mythicFishNameCores)}`;
  }
  return `${pickRandom(legendaryFishNamePrefixes)}${pickRandom(legendaryFishNameCores)}`;
};

const generateBoringCommonFishName = (): string =>
  `${pickRandom(commonFishNamePrefixes)} ${pickRandom(commonFishNameCores)}`;

const rollFishEnchantment = (): FishEnchantment | null => {
  const roll = Math.random();
  let threshold = 0;
  for (const enchantment of fishEnchantments) {
    threshold += enchantment.chance;
    if (roll < threshold) return enchantment;
  }
  return null;
};

const FISH_RARITY_SORT_DESC: FishRarity[] = ['God', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common', 'Trash'];
const fishRarityRank: Record<FishRarity, number> = {
  Trash: 0,
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
  Mythic: 5,
  God: 6
};
const rodTierRank: Record<RodTier, number> = {
  starter: 1,
  improved: 2,
  elite: 3,
  god: 4
};

const formatPercent = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
};

const formatSignedPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatPercent(Math.abs(value))}`;
};

const formatSignedMinutes = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value)}m`;
};

const knownFishByKey = new Map<string, { displayName: string; rarity: FishRarity }>();
for (const seasonEntries of Object.values(FISH_SEASONS)) {
  for (const fish of seasonEntries) {
    if (!knownFishByKey.has(fish.key)) {
      knownFishByKey.set(fish.key, { displayName: fish.displayName, rarity: fish.rarity });
    }
  }
}
for (const fallbackFish of [
  { key: 'rusted_junk', displayName: 'Rusted Junk', rarity: 'Trash' as FishRarity },
  { key: 'tangled_boot', displayName: 'Tangled Boot', rarity: 'Trash' as FishRarity },
  { key: 'common_catch', displayName: 'Common Catch', rarity: 'Common' as FishRarity },
  { key: 'rare_catch', displayName: 'Rare Catch', rarity: 'Rare' as FishRarity },
  { key: 'epic_catch', displayName: 'Epic Catch', rarity: 'Epic' as FishRarity },
  { key: 'legendary_catch', displayName: 'Legendary Catch', rarity: 'Legendary' as FishRarity },
  { key: 'mythic_catch', displayName: 'Mythic Catch', rarity: 'Mythic' as FishRarity },
  { key: 'god_catch', displayName: 'God Catch', rarity: 'God' as FishRarity }
]) {
  if (!knownFishByKey.has(fallbackFish.key)) {
    knownFishByKey.set(fallbackFish.key, {
      displayName: fallbackFish.displayName,
      rarity: fallbackFish.rarity
    });
  }
}

const toTitleFromSnake = (value: string): string =>
  value
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const normalizeRarity = (value: string | null | undefined): FishRarity => {
  if (!value) return 'Common';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'trash') return 'Trash';
  if (normalized === 'common') return 'Common';
  if (normalized === 'rare') return 'Rare';
  if (normalized === 'epic') return 'Epic';
  if (normalized === 'legendary') return 'Legendary';
  if (normalized === 'mythic') return 'Mythic';
  if (normalized === 'god') return 'God';
  return 'Common';
};

const resolveFishInfo = (fishKey: string, rarityHint?: string | null): { displayName: string; rarity: FishRarity } => {
  const known = knownFishByKey.get(fishKey);
  if (known) return known;
  return {
    displayName: toTitleFromSnake(fishKey),
    rarity: normalizeRarity(rarityHint)
  };
};

const normalizeChannelName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const normalizeWikiSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const normalizeFandomBaseUrl = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
};

const toFandomPageSlug = (value: string): string =>
  value
    .trim()
    .replace(/['"`]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

export class MolgianService {
  private client: Client | null = null;

  private guild: Guild | null = null;

  private eventChannel: TextChannel | null = null;

  private citizensRoleId: string | null = null;

  private activeUsers = new Map<string, number>();

  private activeEggState: ActiveEggState | null = null;

  private majorTimer: NodeJS.Timeout | null = null;

  private microTimer: NodeJS.Timeout | null = null;

  private eggInterval: NodeJS.Timeout | null = null;

  private jackpotInterval: NodeJS.Timeout | null = null;

  private weeklyTaxInterval: NodeJS.Timeout | null = null;

  public async initialize(client: Client): Promise<void> {
    this.client = client;
    const { GUILD_ID } = getDiscordEnv();
    this.guild = await client.guilds.fetch(GUILD_ID);
    await this.guild.channels.fetch();
    this.eventChannel = await this.ensureEventChannel(this.guild);
    this.seedDefaults();
    this.backfillLegacyCatchNames();
    this.seedEggSpawn();
    client.on('messageCreate', (message) => {
      if (message.author.bot) return;
      this.noteUserActive(message.author.id);
    });
    this.startSchedulers();
  }

  public shutdown(): void {
    if (this.majorTimer) clearTimeout(this.majorTimer);
    if (this.microTimer) clearTimeout(this.microTimer);
    if (this.eggInterval) clearInterval(this.eggInterval);
    if (this.jackpotInterval) clearInterval(this.jackpotInterval);
    if (this.weeklyTaxInterval) clearInterval(this.weeklyTaxInterval);
  }

  public noteUserActive(discordId: string): void {
    this.activeUsers.set(discordId, nowMs());
  }

  public async claimCitizensRole(discordId: string): Promise<{ ok: boolean; message: string }> {
    if (!this.guild) {
      return { ok: false, message: 'Guild is not ready yet. Try again in a few seconds.' };
    }
    this.noteUserActive(discordId);
    const member = await this.guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      return { ok: false, message: 'Could not find your server member record.' };
    }
    const role = await this.ensureCitizensRole(this.guild);
    if (member.roles.cache.has(role.id)) {
      return { ok: true, message: `You already have ${role}.` };
    }
    try {
      await member.roles.add(role);
      return { ok: true, message: `Role granted: ${role}. Welcome!` };
    } catch (error) {
      logger.error('Failed to grant Citizens role', { error: String(error), discordId, roleId: role.id });
      return {
        ok: false,
        message:
          'I could not assign the role. Move the bot role above Citizens in Server Settings > Roles, then try again.'
      };
    }
  }

  public async adminPostCitizensPanel(): Promise<{ ok: boolean; message: string }> {
    if (!this.guild) {
      return { ok: false, message: 'Guild is not ready yet. Try again in a few seconds.' };
    }
    await this.ensureCitizensOnboarding(this.guild);
    return {
      ok: true,
      message: `Citizens role panel posted/updated in #${RULES_CHANNEL_NAME}.`
    };
  }

  private currentWindowStart(timestampMs = nowMs()): number {
    return getWorkWindowStart(timestampMs, appEnv.TIMEZONE, DAILY_RESET_HOUR);
  }

  private currentDayKey(timestampMs = nowMs()): string {
    return toDayKey(this.currentWindowStart(timestampMs), appEnv.TIMEZONE);
  }

  private currentWeekKey(timestampMs = nowMs()): string {
    return DateTime.fromMillis(this.currentWindowStart(timestampMs), { zone: appEnv.TIMEZONE }).toFormat("kkkk-'W'WW");
  }

  private previousDayKey(timestampMs = nowMs()): string {
    return toDayKey(this.currentWindowStart(timestampMs) - 1, appEnv.TIMEZONE);
  }

  private workStreakCountKey(userId: number): string {
    return `work:streak:count:${userId}`;
  }

  private workStreakLastDayKey(userId: number): string {
    return `work:streak:last_day:${userId}`;
  }

  private missionProgressKey(userId: number, missionId: string, periodKey: string): string {
    return `mission:progress:${missionId}:${userId}:${periodKey}`;
  }

  private missionClaimedKey(userId: number, missionId: string, periodKey: string): string {
    return `mission:claimed:${missionId}:${userId}:${periodKey}`;
  }

  private shardRemainderTenthsKey(userId: number): string {
    return `shards:remainder_tenths:${userId}`;
  }

  private legacyShardHalfKey(userId: number): string {
    return `shards:half:${userId}`;
  }

  private getState(key: string): string | null {
    return db.select().from(appState).where(eq(appState.key, key)).get()?.value ?? null;
  }

  private getStateNumber(key: string): number | null {
    const value = this.getState(key);
    if (value === null) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private setState(key: string, value: string): void {
    db.insert(appState)
      .values({ key, value, updatedAt: nowMs() })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value, updatedAt: nowMs() }
      })
      .run();
  }

  private isBoostActive(key: string): boolean {
    const until = this.getStateNumber(key);
    if (!until) return false;
    return until > nowMs();
  }

  private seedDefaults(): void {
    const treasuryRow = db.select().from(treasury).where(eq(treasury.id, 1)).get();
    if (!treasuryRow) {
      db.insert(treasury).values({ id: 1, amount: 0, updatedAt: nowMs() }).run();
    }
  }

  private backfillLegacyCatchNames(): void {
    const legacyRows = db
      .select({
        id: fishCatches.id,
        rarity: fishCatches.rarity
      })
      .from(fishCatches)
      .where(sql`${fishCatches.caughtName} is null`)
      .all();
    if (legacyRows.length === 0) return;

    for (const row of legacyRows) {
      const rarity = normalizeRarity(row.rarity);
      let caughtName: string | null = null;
      if (rarity === 'God') {
        caughtName = generateEliteFishName('God');
      } else if (rarity === 'Mythic') {
        caughtName = 'Leviathan Prime';
      } else if (rarity === 'Legendary') {
        caughtName = generateEliteFishName('Legendary');
      } else if (rarity === 'Common') {
        caughtName = generateBoringCommonFishName();
      }
      if (!caughtName) continue;
      db.update(fishCatches).set({ caughtName }).where(eq(fishCatches.id, row.id)).run();
    }
  }

  private seedEggSpawn(): void {
    if (this.getStateNumber('egg:next_spawn_at') !== null) return;
    this.setState('egg:next_spawn_at', String(nowMs() + randomIntInclusive(8 * 60_000, 18 * 60_000)));
  }

  private async ensureEventChannel(guild: Guild): Promise<TextChannel> {
    const targetName = normalizeChannelName(appEnv.EVENT_CHANNEL_NAME);
    const existing = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        normalizeChannelName(channel.name) === targetName
    );
    if (existing && existing.isTextBased() && !existing.isDMBased()) {
      return existing as TextChannel;
    }
    return guild.channels.create({ name: targetName, type: ChannelType.GuildText });
  }

  private async ensureRulesChannel(guild: Guild): Promise<TextChannel> {
    const targetName = normalizeChannelName(RULES_CHANNEL_NAME);
    const existing = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        normalizeChannelName(channel.name) === targetName
    );
    if (existing && existing.isTextBased() && !existing.isDMBased()) {
      return existing as TextChannel;
    }
    return guild.channels.create({ name: targetName, type: ChannelType.GuildText });
  }

  private findRoleByNormalizedName(guild: Guild, roleName: string): Role | null {
    const targetName = normalizeChannelName(roleName);
    return guild.roles.cache.find((role) => normalizeChannelName(role.name) === targetName) ?? null;
  }

  private async ensureCitizensRole(guild: Guild): Promise<Role> {
    const roleIdFromState = this.getState('citizens:role_id');
    const knownRoleId = this.citizensRoleId ?? roleIdFromState;
    const existingByState = knownRoleId ? guild.roles.cache.get(knownRoleId) : null;
    if (existingByState) {
      this.citizensRoleId = existingByState.id;
      this.setState('citizens:role_id', existingByState.id);
      return existingByState;
    }
    const existingByName = this.findRoleByNormalizedName(guild, CITIZENS_ROLE_NAME);
    if (existingByName) {
      this.citizensRoleId = existingByName.id;
      this.setState('citizens:role_id', existingByName.id);
      return existingByName;
    }
    const created = await guild.roles.create({
      name: CITIZENS_ROLE_NAME,
      mentionable: true,
      reason: 'Molgian Bureau onboarding role'
    });
    this.citizensRoleId = created.id;
    this.setState('citizens:role_id', created.id);
    return created;
  }

  private async ensureCitizensOnboarding(guild: Guild): Promise<void> {
    const role = await this.ensureCitizensRole(guild);
    const rulesChannel = await this.ensureRulesChannel(guild);
    const panelPayload = createCitizensRolePanelPayload(role);
    const panelChannelId = this.getState('citizens:panel_channel_id');
    const panelMessageId = this.getState('citizens:panel_message_id');

    let panelMessage: Message | null = null;
    if (panelMessageId && panelChannelId === rulesChannel.id) {
      panelMessage = await rulesChannel.messages.fetch(panelMessageId).catch(() => null);
    }
    if (!panelMessage) {
      const recent = await rulesChannel.messages.fetch({ limit: 30 }).catch(() => null);
      panelMessage =
        recent?.find(
          (message) =>
            message.author.id === this.client?.user?.id &&
            message.embeds.some((embed) => embed.title === 'Welcome To Molgarians')
        ) ?? null;
    }

    if (panelMessage) {
      await panelMessage.edit(panelPayload);
      this.setState('citizens:panel_channel_id', rulesChannel.id);
      this.setState('citizens:panel_message_id', panelMessage.id);
      return;
    }

    const createdPanel = await rulesChannel.send(panelPayload);
    this.setState('citizens:panel_channel_id', rulesChannel.id);
    this.setState('citizens:panel_message_id', createdPanel.id);
  }

  private async ensureHofChannel(): Promise<TextChannel | null> {
    if (!this.guild) return null;
    const existing = this.guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        (channel.name.toLowerCase() === 'hall-of-fame' || channel.name.toLowerCase() === 'mythic-hall-of-fame')
    );
    if (existing && existing.isTextBased() && !existing.isDMBased()) {
      return existing as TextChannel;
    }
    return this.guild.channels.create({ name: 'mythic-hall-of-fame', type: ChannelType.GuildText });
  }

  private async ensureUser(discordId: string, username: string): Promise<typeof users.$inferSelect> {
    const existing = db.select().from(users).where(eq(users.discordId, discordId)).get();
    if (existing) {
      if (existing.username !== username || existing.salaryBase < 150) {
        db.update(users)
          .set({
            username,
            salaryBase: existing.salaryBase < 150 ? 150 : existing.salaryBase,
            updatedAt: nowMs()
          })
          .where(eq(users.id, existing.id))
          .run();
      }
      const wallet = db.select().from(balances).where(eq(balances.userId, existing.id)).get();
      if (!wallet) {
        db.insert(balances).values({ userId: existing.id, amount: 0 }).run();
      }
      const eggs = db.select().from(eggsInventory).where(eq(eggsInventory.userId, existing.id)).get();
      if (!eggs) {
        db.insert(eggsInventory).values({ userId: existing.id, eggs: 0, mythicEggs: 0, lastWinAt: null }).run();
      }
      const shardRow = db.select().from(shards).where(eq(shards.userId, existing.id)).get();
      if (!shardRow) {
        db.insert(shards).values({ userId: existing.id, amount: 0 }).run();
      }
      const activePetRow = db.select().from(activePet).where(eq(activePet.userId, existing.id)).get();
      if (!activePetRow) {
        db.insert(activePet).values({ userId: existing.id, petInstanceId: null, equippedAt: null }).run();
      }
      return existing;
    }
    const timestamp = nowMs();
    const user = db
      .insert(users)
      .values({
        discordId,
        username,
        salaryBase: 150,
        lastWorkAt: null,
        xp: 0,
        level: 1,
        lifetimeEggsHatched: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning()
      .get();
    db.insert(balances).values({ userId: user.id, amount: 0 }).run();
    db.insert(eggsInventory).values({ userId: user.id, eggs: 0, mythicEggs: 0, lastWinAt: null }).run();
    db.insert(shards).values({ userId: user.id, amount: 0 }).run();
    db.insert(activePet).values({ userId: user.id, petInstanceId: null, equippedAt: null }).run();
    return user;
  }

  private async getUser(discordId: string, username?: string): Promise<typeof users.$inferSelect> {
    const row = db.select().from(users).where(eq(users.discordId, discordId)).get();
    if (!row) return this.ensureUser(discordId, username ?? `user-${discordId}`);
    if (username && row.username !== username) {
      db.update(users).set({ username, updatedAt: nowMs() }).where(eq(users.id, row.id)).run();
    }
    return row;
  }

  private changeBalance(userId: number, delta: number): number {
    return db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, userId)).get();
      if (!wallet) throw new Error('Missing wallet');
      const next = wallet.amount + delta;
      if (delta < 0 && next < 0) throw new Error('Insufficient Molgium');
      tx.update(balances).set({ amount: next }).where(eq(balances.userId, userId)).run();
      return next;
    });
  }

  private currentBalance(userId: number): number {
    return db.select().from(balances).where(eq(balances.userId, userId)).get()?.amount ?? 0;
  }

  private debtLockMessage(balance: number, action: string): string {
    return (
      `Debt lock active (${balance} Molgium). ` +
      `Use /work and /fish sell to recover before ${action}.`
    );
  }

  private debtGuard(userId: number, action: string): { ok: true } | { ok: false; message: string } {
    const balance = this.currentBalance(userId);
    if (balance >= 0) return { ok: true };
    return { ok: false, message: this.debtLockMessage(balance, action) };
  }

  private applyRaidCharge(
    userId: number,
    requestedAmount: number,
    allowDebt: boolean
  ): {
    charged: number;
    newBalance: number;
    treasuryAdded: number;
    burned: number;
    capped: boolean;
  } {
    const safeRequested = Math.max(0, Math.floor(requestedAmount));
    return db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, userId)).get();
      if (!wallet) throw new Error('Wallet missing.');

      if (!allowDebt && wallet.amount < safeRequested) {
        throw new Error('Insufficient Molgium');
      }

      const chargeResult = allowDebt
        ? clampRaidChargeWithDebtFloor(wallet.amount, safeRequested, RAID_DEBT_MIN_BALANCE)
        : {
            charged: safeRequested,
            newBalance: wallet.amount - safeRequested,
            capped: false
          };

      if (chargeResult.charged > 0) {
        tx
          .update(balances)
          .set({ amount: chargeResult.newBalance })
          .where(eq(balances.userId, userId))
          .run();
      }

      const sink = splitRaidSink(chargeResult.charged);
      if (sink.treasury > 0) {
        const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
        if (!treasuryRow) throw new Error('Treasury missing');
        tx
          .update(treasury)
          .set({ amount: treasuryRow.amount + sink.treasury, updatedAt: nowMs() })
          .where(eq(treasury.id, 1))
          .run();
      }

      return {
        charged: chargeResult.charged,
        newBalance: chargeResult.newBalance,
        treasuryAdded: sink.treasury,
        burned: sink.burned,
        capped: chargeResult.capped
      };
    });
  }

  private parseTenths(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9) return null;
    return numeric;
  }

  private readShardRemainderTenths(userId: number): number {
    const remainder = this.parseTenths(this.getState(this.shardRemainderTenthsKey(userId)));
    if (remainder !== null) return remainder;
    const legacyHalf = this.getState(this.legacyShardHalfKey(userId)) === '1';
    if (legacyHalf) {
      this.setState(this.shardRemainderTenthsKey(userId), '5');
      this.setState(this.legacyShardHalfKey(userId), '0');
      return 5;
    }
    return 0;
  }

  private getShardTenths(userId: number): number {
    const fullShards = db.select().from(shards).where(eq(shards.userId, userId)).get()?.amount ?? 0;
    return fullShards * 10 + this.readShardRemainderTenths(userId);
  }

  private addShardsTenths(userId: number, deltaTenths: number): number {
    if (!Number.isInteger(deltaTenths)) throw new Error('Shard delta must be an integer number of tenths.');
    return db.transaction((tx) => {
      const shardRow = tx.select().from(shards).where(eq(shards.userId, userId)).get();
      if (!shardRow) throw new Error('shards row missing');

      const remainderKey = this.shardRemainderTenthsKey(userId);
      const legacyHalfKey = this.legacyShardHalfKey(userId);
      const remainderRow = tx.select().from(appState).where(eq(appState.key, remainderKey)).get();
      const legacyHalfRow = tx.select().from(appState).where(eq(appState.key, legacyHalfKey)).get();

      const explicitRemainder = this.parseTenths(remainderRow?.value);
      const legacyHalf = legacyHalfRow?.value === '1';
      const currentRemainderTenths = explicitRemainder ?? (legacyHalf ? 5 : 0);
      const currentTenths = shardRow.amount * 10 + currentRemainderTenths;
      const nextTenths = currentTenths + deltaTenths;
      if (nextTenths < 0) throw new Error('Not enough shards.');

      const nextWholeShards = Math.floor(nextTenths / 10);
      const nextRemainderTenths = nextTenths % 10;
      tx.update(shards).set({ amount: nextWholeShards }).where(eq(shards.userId, userId)).run();
      tx.insert(appState)
        .values({ key: remainderKey, value: String(nextRemainderTenths), updatedAt: nowMs() })
        .onConflictDoUpdate({
          target: appState.key,
          set: { value: String(nextRemainderTenths), updatedAt: nowMs() }
        })
        .run();
      tx.insert(appState)
        .values({ key: legacyHalfKey, value: '0', updatedAt: nowMs() })
        .onConflictDoUpdate({
          target: appState.key,
          set: { value: '0', updatedAt: nowMs() }
        })
        .run();
      return nextTenths;
    });
  }

  private getShardDisplayAmount(userId: number): number {
    return this.getShardTenths(userId) / 10;
  }

  private formatShardAmount(amount: number): string {
    return Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);
  }

  private addTreasury(amount: number): number {
    if (amount <= 0) return this.getTreasury();
    return db.transaction((tx) => {
      const current = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!current) throw new Error('Treasury missing');
      const next = current.amount + amount;
      tx.update(treasury).set({ amount: next, updatedAt: nowMs() }).where(eq(treasury.id, 1)).run();
      return next;
    });
  }

  private takeTreasury(maxAmount: number): number {
    return db.transaction((tx) => {
      const current = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!current) throw new Error('Treasury missing');
      const payout = Math.min(maxAmount, current.amount);
      tx
        .update(treasury)
        .set({ amount: current.amount - payout, updatedAt: nowMs() })
        .where(eq(treasury.id, 1))
        .run();
      return payout;
    });
  }

  public getTreasury(): number {
    return db.select().from(treasury).where(eq(treasury.id, 1)).get()?.amount ?? 0;
  }

  private weeklyTreasuryTaxWeekKey(): string {
    return 'tax:weekly_wallet_20:last_week_key';
  }

  private async applyWeeklyTreasuryTaxIfDue(): Promise<void> {
    const weekKey = this.currentWeekKey();
    const previousWeekKey = this.getState(this.weeklyTreasuryTaxWeekKey());
    if (previousWeekKey === weekKey) return;
    if (!previousWeekKey) {
      this.setState(this.weeklyTreasuryTaxWeekKey(), weekKey);
      return;
    }

    let collected = 0;
    let taxedUsers = 0;
    db.transaction((tx) => {
      const wallets = tx.select().from(balances).all();
      const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!treasuryRow) throw new Error('Treasury missing');

      for (const wallet of wallets) {
        if (wallet.amount <= 0) continue;
        const tax = Math.floor(wallet.amount * WEEKLY_TREASURY_WALLET_TAX_RATE);
        if (tax <= 0) continue;
        tx.update(balances).set({ amount: wallet.amount - tax }).where(eq(balances.userId, wallet.userId)).run();
        collected += tax;
        taxedUsers += 1;
      }

      if (collected > 0) {
        tx
          .update(treasury)
          .set({ amount: treasuryRow.amount + collected, updatedAt: nowMs() })
          .where(eq(treasury.id, 1))
          .run();
      }
    });

    this.setState(this.weeklyTreasuryTaxWeekKey(), weekKey);

    if (collected > 0) {
      await this.sendEventPing(
        `Weekly Treasury Tax: collected ${collected} Molgium total (${Math.round(
          WEEKLY_TREASURY_WALLET_TAX_RATE * 100
        )}% from ${taxedUsers} wallets).`
      );
    }
  }

  private getWorkStreakCount(userId: number): number {
    const raw = this.getStateNumber(this.workStreakCountKey(userId));
    if (!raw || raw < 0) return 0;
    return Math.floor(raw);
  }

  private getEffectiveWorkStreak(userId: number, timestampMs = nowMs()): number {
    const streak = this.getWorkStreakCount(userId);
    if (streak <= 0) return 0;
    const lastDay = this.getState(this.workStreakLastDayKey(userId));
    if (!lastDay) return 0;
    const today = this.currentDayKey(timestampMs);
    const yesterday = this.previousDayKey(timestampMs);
    if (lastDay !== today && lastDay !== yesterday) return 0;
    return streak;
  }

  private updateWorkStreak(userId: number, timestampMs = nowMs()): { streak: number; bonusPct: number } {
    const today = this.currentDayKey(timestampMs);
    const yesterday = this.previousDayKey(timestampMs);
    const lastDay = this.getState(this.workStreakLastDayKey(userId));
    const prior = this.getWorkStreakCount(userId);

    let streak = 1;
    if (lastDay === yesterday) {
      streak = prior + 1;
    } else if (lastDay === today) {
      streak = Math.max(1, prior);
    }

    this.setState(this.workStreakCountKey(userId), String(streak));
    this.setState(this.workStreakLastDayKey(userId), today);

    const bonusPct = Math.min(streak * WORK_STREAK_BONUS_PER_DAY, WORK_STREAK_BONUS_CAP);
    return { streak, bonusPct };
  }

  private missionPeriodKey(period: MissionPeriod, timestampMs = nowMs()): string {
    return period === 'daily' ? this.currentDayKey(timestampMs) : this.currentWeekKey(timestampMs);
  }

  private missionProgress(userId: number, mission: MissionDefinition, timestampMs = nowMs()): {
    progress: number;
    completed: boolean;
    claimed: boolean;
    periodKey: string;
  } {
    const periodKey = this.missionPeriodKey(mission.period, timestampMs);
    const progressValue = this.getStateNumber(this.missionProgressKey(userId, mission.id, periodKey)) ?? 0;
    const progress = Math.max(0, Math.min(mission.target, Math.floor(progressValue)));
    const claimed = this.getState(this.missionClaimedKey(userId, mission.id, periodKey)) === '1';
    return { progress, completed: progress >= mission.target, claimed, periodKey };
  }

  private incrementMissionMetric(userId: number, metric: MissionMetric, amount = 1): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const increment = Math.floor(amount);
    if (increment <= 0) return;
    const timestampMs = nowMs();

    for (const mission of MISSION_DEFINITIONS) {
      if (mission.metric !== metric) continue;
      const periodKey = this.missionPeriodKey(mission.period, timestampMs);
      const progressKey = this.missionProgressKey(userId, mission.id, periodKey);
      const existing = this.getStateNumber(progressKey) ?? 0;
      const next = Math.max(0, Math.min(mission.target, Math.floor(existing) + increment));
      this.setState(progressKey, String(next));
    }
  }

  public async missionsView(discordId: string, username: string): Promise<{
    dailyKey: string;
    weeklyKey: string;
    daily: Array<{
      id: string;
      label: string;
      progress: number;
      target: number;
      completed: boolean;
      claimed: boolean;
    }>;
    weekly: Array<{
      id: string;
      label: string;
      progress: number;
      target: number;
      completed: boolean;
      claimed: boolean;
    }>;
  }> {
    const user = await this.ensureUser(discordId, username);
    const timestampMs = nowMs();
    const dailyKey = this.currentDayKey(timestampMs);
    const weeklyKey = this.currentWeekKey(timestampMs);

    const mapped = MISSION_DEFINITIONS.map((mission) => {
      const state = this.missionProgress(user.id, mission, timestampMs);
      return {
        id: mission.id,
        label: mission.label,
        progress: state.progress,
        target: mission.target,
        completed: state.completed,
        claimed: state.claimed,
        period: mission.period
      };
    });

    return {
      dailyKey,
      weeklyKey,
      daily: mapped.filter((entry) => entry.period === 'daily'),
      weekly: mapped.filter((entry) => entry.period === 'weekly')
    };
  }

  public async missionClaim(
    discordId: string,
    username: string,
    missionId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const mission = MISSION_DEFINITIONS.find((entry) => entry.id === missionId);
    if (!mission) return { ok: false, message: 'Unknown mission id.' };

    const state = this.missionProgress(user.id, mission, nowMs());
    if (!state.completed) {
      return {
        ok: false,
        message: `Mission not complete yet: ${mission.label} (${state.progress}/${mission.target}).`
      };
    }
    if (state.claimed) return { ok: false, message: 'Mission already claimed for this period.' };

    const rewardTenths = pickRandom(MISSION_SHARD_REWARD_TENTHS);
    const [minMolgium, maxMolgium] = MISSION_MOLGIUM_REWARD_RANGE[mission.period];
    const molgiumReward = randomIntInclusive(minMolgium, maxMolgium);
    const newBalance = this.changeBalance(user.id, molgiumReward);
    this.addShardsTenths(user.id, rewardTenths);
    this.setState(this.missionClaimedKey(user.id, mission.id, state.periodKey), '1');

    return {
      ok: true,
      message:
        `Mission claimed: ${mission.label}. ` +
        `Reward: ${this.formatShardAmount(rewardTenths / 10)} shards + ${molgiumReward} Molgium. ` +
        `New balance: ${newBalance} Molgium.`
    };
  }

  private ensureClassProgressRow(userId: number): typeof userClassProgress.$inferSelect {
    const existing = db.select().from(userClassProgress).where(eq(userClassProgress.userId, userId)).get();
    if (existing) return existing;
    db.insert(userClassProgress)
      .values({
        userId,
        baseClassKey: null,
        t2PathKey: null,
        t3SpecKey: null,
        quizRecommendation: null,
        resetCount: 0,
        selectedAt: null,
        advancedAt: null,
        updatedAt: nowMs()
      })
      .run();
    return db.select().from(userClassProgress).where(eq(userClassProgress.userId, userId)).get()!;
  }

  private ensureMaterialRows(userId: number): void {
    const keys = MATERIAL_KEYS;
    for (const key of keys) {
      const row = db
        .select()
        .from(craftingMaterials)
        .where(and(eq(craftingMaterials.userId, userId), eq(craftingMaterials.materialKey, key)))
        .get();
      if (row) continue;
      db.insert(craftingMaterials)
        .values({
          userId,
          materialKey: key,
          amount: 0,
          updatedAt: nowMs()
        })
        .run();
    }
  }

  private materialAmount(userId: number, key: MaterialKey): number {
    const row = db
      .select()
      .from(craftingMaterials)
      .where(and(eq(craftingMaterials.userId, userId), eq(craftingMaterials.materialKey, key)))
      .get();
    return row?.amount ?? 0;
  }

  private createGearInstance(
    tx: any,
    data: {
      userId: number;
      templateKey: string;
      name: string;
      slot: GearSlot;
      rarity: GearRarity;
      classAffinity: BaseClassKey | null;
      setKey: string | null;
      source: string;
      stats: StatLine;
    }
  ): number {
    const inserted = tx
      .insert(gearInstances)
      .values({
        userId: data.userId,
        templateKey: data.templateKey,
        name: data.name,
        slot: data.slot,
        rarity: data.rarity,
        classAffinity: data.classAffinity,
        setKey: data.setKey,
        source: data.source,
        power: data.stats.power,
        guard: data.stats.guard,
        crit: data.stats.crit,
        haste: data.stats.haste,
        precision: data.stats.precision,
        resolve: data.stats.resolve,
        yield: data.stats.yield,
        scavenge: data.stats.scavenge,
        luckControl: data.stats.luckControl,
        createdAt: nowMs()
      })
      .run();
    return Number(inserted.lastInsertRowid);
  }

  private multiplyStats(stats: StatLine, ratio: number): StatLine {
    const result = emptyStats();
    for (const [key, value] of Object.entries(stats) as Array<[keyof StatLine, number]>) {
      result[key] = Math.max(0, Math.floor(value * ratio));
    }
    return result;
  }

  private classPathSummary(row: typeof userClassProgress.$inferSelect): string {
    if (!row.baseClassKey) return 'None';
    const base = baseClassByKey(row.baseClassKey as BaseClassKey);
    if (!base) return 'Unknown';
    const selectedPath = row.t2PathKey
      ? base.paths.find((entry) => entry.key === row.t2PathKey)
      : null;
    if (!selectedPath) return `${base.name} (base only)`;
    return `${base.name} -> ${selectedPath.name} -> ${selectedPath.t3Name}`;
  }

  private gearSlots(): GearSlot[] {
    return ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'relic'];
  }

  private readEquippedGear(userId: number): Array<typeof gearInstances.$inferSelect> {
    const equipRows = db.select().from(userGearEquips).where(eq(userGearEquips.userId, userId)).all();
    if (equipRows.length === 0) return [];
    return equipRows
      .map((equip) => {
        if (!equip.gearInstanceId) return null;
        return db.select().from(gearInstances).where(eq(gearInstances.id, equip.gearInstanceId)).get() ?? null;
      })
      .filter((row): row is typeof gearInstances.$inferSelect => row !== null);
  }

  private computeRaidPower(userId: number): {
    power: number;
    classPath: string;
    setBonuses: string;
    equipCount: number;
  } {
    const classRow = this.ensureClassProgressRow(userId);
    const classPath = this.classPathSummary(classRow);
    const equipped = this.readEquippedGear(userId);
    const stats = emptyStats();
    for (const row of equipped) {
      stats.power += row.power;
      stats.guard += row.guard;
      stats.crit += row.crit;
      stats.haste += row.haste;
      stats.precision += row.precision;
      stats.resolve += row.resolve;
      stats.yield += row.yield;
      stats.scavenge += row.scavenge;
      stats.luckControl += row.luckControl;
    }

    let raidPower =
      120 +
      stats.power * 1.2 +
      stats.guard * 0.6 +
      stats.crit * 0.55 +
      stats.haste * 0.45 +
      stats.precision * 0.5 +
      stats.resolve * 0.4 +
      stats.luckControl * 0.35;
    if (classRow.baseClassKey) raidPower += 80;
    if (classRow.t2PathKey) raidPower += 90;
    if (classRow.t3SpecKey) raidPower += 110;

    const setCounts = new Map<string, number>();
    for (const row of equipped) {
      if (!row.setKey) continue;
      setCounts.set(row.setKey, (setCounts.get(row.setKey) ?? 0) + 1);
    }
    const setBonuses: string[] = [];
    for (const [setKey, count] of setCounts.entries()) {
      const bonus = gearSetBonuses[setKey];
      if (!bonus) continue;
      if (count >= 2) {
        raidPower *= 1.08;
        setBonuses.push(`${setKey}: 2-piece active`);
      }
      if (count >= 4 && classRow.baseClassKey === bonus.mainClassKey && classRow.t3SpecKey) {
        raidPower *= 1.12;
        setBonuses.push(`${setKey}: 4-piece specialization active`);
      }
    }

    return {
      power: Math.max(50, Math.floor(raidPower)),
      classPath,
      setBonuses: setBonuses.length > 0 ? setBonuses.join(', ') : 'none',
      equipCount: equipped.length
    };
  }

  public classListText(): string {
    const lines: string[] = [];
    lines.push(`Starter class unlock cost: ${STARTER_CLASS_COST} Molgium.`);
    lines.push('Choose one base class, then one T2 path. T2 locks your T3 specialization.');
    for (const base of BASE_CLASS_DEFINITIONS) {
      lines.push('');
      lines.push(`- ${base.name}: ${base.description}`);
      for (const path of base.paths) {
        lines.push(`  • ${path.name} -> ${path.t3Name}`);
      }
    }
    return lines.join('\n');
  }

  public async classQuiz(
    discordId: string,
    username: string,
    style: ClassQuizStyle,
    goal: ClassQuizGoal,
    vibe: ClassQuizVibe
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const result = runClassQuiz(style, goal, vibe);
    this.ensureClassProgressRow(user.id);
    db.update(userClassProgress)
      .set({ quizRecommendation: result.recommended.key, updatedAt: nowMs() })
      .where(eq(userClassProgress.userId, user.id))
      .run();
    return {
      ok: true,
      message:
        `Recommended class: **${result.recommended.name}**\n` +
        `${result.recommended.description}\n` +
        `Try /class choose main:${result.recommended.key}`
    };
  }

  public async classChoose(
    discordId: string,
    username: string,
    baseClassKey: BaseClassKey
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.ensureMaterialRows(user.id);
    const classRow = this.ensureClassProgressRow(user.id);
    if (classRow.baseClassKey) {
      return { ok: false, message: 'You already have a base class. Use /class reset to change.' };
    }
    const base = baseClassByKey(baseClassKey);
    if (!base) return { ok: false, message: 'Invalid base class.' };

    let newBalance = 0;
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing.');
        if (wallet.amount < STARTER_CLASS_COST) throw new Error('Not enough Molgium for starter class.');
        newBalance = wallet.amount - STARTER_CLASS_COST;
        tx.update(balances).set({ amount: newBalance }).where(eq(balances.userId, user.id)).run();
        tx
          .update(userClassProgress)
          .set({
            baseClassKey,
            t2PathKey: null,
            t3SpecKey: null,
            selectedAt: nowMs(),
            advancedAt: null,
            updatedAt: nowMs()
          })
          .where(eq(userClassProgress.userId, user.id))
          .run();

        const starterWeaponStats = this.multiplyStats(base.paths[0].weights, 0.5);
        const starterChestStats = this.multiplyStats(base.paths[1].weights, 0.38);
        const weaponId = this.createGearInstance(tx, {
          userId: user.id,
          templateKey: `starter_${base.key}_weapon`,
          name: `${base.setPrefix} Recruit Armament`,
          slot: 'weapon',
          rarity: 'Common',
          classAffinity: base.key,
          setKey: `set_${base.key}`,
          source: 'starter_class',
          stats: starterWeaponStats
        });
        const chestId = this.createGearInstance(tx, {
          userId: user.id,
          templateKey: `starter_${base.key}_chest`,
          name: `${base.setPrefix} Recruit Cuirass`,
          slot: 'chest',
          rarity: 'Common',
          classAffinity: base.key,
          setKey: `set_${base.key}`,
          source: 'starter_class',
          stats: starterChestStats
        });
        tx
          .insert(userGearEquips)
          .values({ userId: user.id, slot: 'weapon', gearInstanceId: weaponId, equippedAt: nowMs() })
          .onConflictDoUpdate({
            target: [userGearEquips.userId, userGearEquips.slot],
            set: { gearInstanceId: weaponId, equippedAt: nowMs() }
          })
          .run();
        tx
          .insert(userGearEquips)
          .values({ userId: user.id, slot: 'chest', gearInstanceId: chestId, equippedAt: nowMs() })
          .onConflictDoUpdate({
            target: [userGearEquips.userId, userGearEquips.slot],
            set: { gearInstanceId: chestId, equippedAt: nowMs() }
          })
          .run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Class selection failed.' };
    }

    return {
      ok: true,
      message:
        `Class chosen: ${base.name}. Cost ${STARTER_CLASS_COST} Molgium.\n` +
        `Starter gear equipped: ${base.setPrefix} Recruit Armament + Recruit Cuirass.\n` +
        `New balance: ${newBalance} Molgium.`
    };
  }

  public async classPath(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const row = this.ensureClassProgressRow(user.id);
    const pathText = this.classPathSummary(row);
    return {
      ok: true,
      message:
        `Current class path: ${pathText}\n` +
        `Resets used: ${row.resetCount}\n` +
        `Reset cost: ${CLASS_RESET_COST} Molgium.`
    };
  }

  public async classAdvance(
    discordId: string,
    username: string,
    pathKey: T2PathKey
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const row = this.ensureClassProgressRow(user.id);
    if (!row.baseClassKey) return { ok: false, message: 'Choose a base class first with /class choose.' };
    if (row.t2PathKey) return { ok: false, message: 'T2 path already selected. Use /class reset to change.' };
    const path = t2PathByKey(row.baseClassKey as BaseClassKey, pathKey);
    if (!path) return { ok: false, message: 'That path is not valid for your base class.' };
    db.update(userClassProgress)
      .set({
        t2PathKey: path.key,
        t3SpecKey: path.t3Key,
        advancedAt: nowMs(),
        updatedAt: nowMs()
      })
      .where(eq(userClassProgress.userId, user.id))
      .run();
    return {
      ok: true,
      message:
        `T2 path selected: ${path.name}\n` +
        `T3 specialization locked: ${path.t3Name}\n` +
        'Your set bonuses now scale with this specialization.'
    };
  }

  public async classReset(
    discordId: string,
    username: string,
    confirm: boolean
  ): Promise<{ ok: boolean; message: string }> {
    if (!confirm) return { ok: false, message: 'Reset canceled. Set confirm:true to proceed.' };
    const user = await this.ensureUser(discordId, username);
    const row = this.ensureClassProgressRow(user.id);
    if (!row.baseClassKey) return { ok: false, message: 'No class to reset.' };

    let nextBalance = 0;
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing.');
        if (wallet.amount < CLASS_RESET_COST) throw new Error('Not enough Molgium for class reset.');
        nextBalance = wallet.amount - CLASS_RESET_COST;
        tx.update(balances).set({ amount: nextBalance }).where(eq(balances.userId, user.id)).run();
        tx
          .update(userClassProgress)
          .set({
            baseClassKey: null,
            t2PathKey: null,
            t3SpecKey: null,
            selectedAt: null,
            advancedAt: null,
            resetCount: row.resetCount + 1,
            updatedAt: nowMs()
          })
          .where(eq(userClassProgress.userId, user.id))
          .run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Class reset failed.' };
    }

    return {
      ok: true,
      message: `Class reset complete for ${CLASS_RESET_COST} Molgium. New balance: ${nextBalance} Molgium.`
    };
  }

  public async shopView(discordId: string, username: string): Promise<{ balance: number }> {
    const user = await this.ensureUser(discordId, username);
    const wallet = db.select().from(balances).where(eq(balances.userId, user.id)).get();
    return { balance: wallet?.amount ?? 0 };
  }

  public async shopCategory(
    discordId: string,
    username: string,
    category: ShopCategory
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    if (category === 'weapons' || category === 'armor') {
      const offers = GEAR_SHOP_OFFERS.filter((entry) => entry.category === category);
      if (offers.length === 0) return { ok: false, message: `No ${category} offers right now.` };
      const lines = offers.map(
        (offer) =>
          `${offer.id}: ${offer.name} [${offer.rarity}] (${offer.slot}) - ${offer.price} Molgium` +
          `${offer.classAffinity ? ` | affinity: ${offer.classAffinity}` : ''}`
      );
      return { ok: true, message: `Category: ${category}\n${lines.join('\n')}` };
    }

    if (category === 'materials') {
      this.ensureMaterialRows(user.id);
      const lines = SHOP_MATERIAL_KEYS.map((key) => {
        const amount = this.materialAmount(user.id, key);
        return `${key}: ${MATERIAL_SHOP_PRICES[key]} Molgium each (owned ${amount})`;
      });
      return { ok: true, message: `Category: materials\n${lines.join('\n')}` };
    }

    if (category === 'rods') {
      const rods = await this.rodShop(discordId, username);
      const lines = rods.map(
        (rod) =>
          `${rod.tier}: ${rod.name} (${rod.cost})${rod.owned ? ' [owned]' : ''}${rod.equipped ? ' [equipped]' : ''} | ${rod.statsSummary}`
      );
      return { ok: true, message: `Category: rods\n${lines.join('\n')}` };
    }

    const jobs = await this.jobList(discordId, username);
    const lines = jobs.tiers.map(
      (tier) =>
        `job_${tier.id}: apply cost ${tier.cost}, SalaryBase ${tier.newSalaryBase}${tier.owned ? ' [hired]' : ''}`
    );
    return { ok: true, message: `Category: jobs\nCurrent SalaryBase: ${jobs.currentSalaryBase}\n${lines.join('\n')}` };
  }

  public async shopBuy(
    discordId: string,
    username: string,
    itemId: string,
    quantity: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'buying from shop');
    if (!debtLock.ok) return debtLock;
    this.ensureMaterialRows(user.id);
    const qty = Math.max(1, Math.floor(quantity));
    if (qty > 999) return { ok: false, message: 'Quantity too high.' };

    const gearOffer = GEAR_SHOP_OFFERS.find((entry) => entry.id === itemId);
    if (gearOffer) {
      const cost = gearOffer.price * qty;
      let newBalance = 0;
      const created: number[] = [];
      try {
        db.transaction((tx) => {
          const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
          if (!wallet) throw new Error('Wallet missing.');
          if (wallet.amount < cost) throw new Error('Insufficient Molgium.');
          newBalance = wallet.amount - cost;
          tx.update(balances).set({ amount: newBalance }).where(eq(balances.userId, user.id)).run();
          for (let i = 0; i < qty; i += 1) {
            const baseStats = rollStatsFromRanges(gearOffer.statRanges);
            const finalStats = this.multiplyStats(baseStats, rarityMultiplier(gearOffer.rarity));
            const id = this.createGearInstance(tx, {
              userId: user.id,
              templateKey: gearOffer.id,
              name: gearOffer.name,
              slot: gearOffer.slot,
              rarity: gearOffer.rarity,
              classAffinity: gearOffer.classAffinity ?? null,
              setKey: null,
              source: 'shop',
              stats: finalStats
            });
            created.push(id);
          }
        });
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Shop purchase failed.' };
      }
      return {
        ok: true,
        message:
          `Purchased ${qty}x ${gearOffer.name} for ${cost} Molgium.\n` +
          `Created gear id(s): ${created.join(', ')}\n` +
          `New balance: ${newBalance} Molgium.`
      };
    }

    const materialId = itemId.toLowerCase().replace('material_', '');
    if (SHOP_MATERIAL_KEYS.includes(materialId as (typeof SHOP_MATERIAL_KEYS)[number])) {
      const material = materialId as (typeof SHOP_MATERIAL_KEYS)[number];
      const cost = MATERIAL_SHOP_PRICES[material] * qty;
      let newBalance = 0;
      let newMaterialAmount = 0;
      try {
        db.transaction((tx) => {
          const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
          if (!wallet) throw new Error('Wallet missing.');
          if (wallet.amount < cost) throw new Error('Insufficient Molgium.');
          newBalance = wallet.amount - cost;
          tx.update(balances).set({ amount: newBalance }).where(eq(balances.userId, user.id)).run();
          const row = tx
            .select()
            .from(craftingMaterials)
            .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, material)))
            .get();
          if (!row) throw new Error('Material row missing.');
          newMaterialAmount = row.amount + qty;
          tx
            .update(craftingMaterials)
            .set({ amount: newMaterialAmount, updatedAt: nowMs() })
            .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, material)))
            .run();
        });
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Material purchase failed.' };
      }
      return {
        ok: true,
        message:
          `Purchased ${qty}x ${material} for ${cost} Molgium.\n` +
          `${material} now: ${newMaterialAmount}\n` +
          `New balance: ${newBalance} Molgium.`
      };
    }

    if (itemId.startsWith('rod_')) {
      const tier = itemId.replace('rod_', '') as RodTier;
      return this.rodBuy(discordId, username, tier);
    }

    if (itemId.startsWith('job_')) {
      const parsed = Number(itemId.replace('job_', ''));
      if (!Number.isFinite(parsed) || parsed < 1) return { ok: false, message: 'Invalid job item id.' };
      return this.jobApply(discordId, username, parsed);
    }

    return { ok: false, message: `Unknown shop item id: ${itemId}` };
  }

  public async gearInventory(
    discordId: string,
    username: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const rows = db
      .select()
      .from(gearInstances)
      .where(eq(gearInstances.userId, user.id))
      .orderBy(desc(gearInstances.id))
      .all();
    if (rows.length === 0) return { ok: false, message: 'No gear owned yet. Use /shop or /forge.' };

    const equipRows = db.select().from(userGearEquips).where(eq(userGearEquips.userId, user.id)).all();
    const equippedSet = new Set(equipRows.map((entry) => entry.gearInstanceId).filter((id): id is number => !!id));

    const lines = rows.slice(0, 30).map((row) => {
      const flag = equippedSet.has(row.id) ? ' [EQUIPPED]' : '';
      return (
        `#${row.id} ${row.name} [${row.rarity}] (${row.slot})${flag}\n` +
        `  ${formatStats({
          power: row.power,
          guard: row.guard,
          crit: row.crit,
          haste: row.haste,
          precision: row.precision,
          resolve: row.resolve,
          yield: row.yield,
          scavenge: row.scavenge,
          luckControl: row.luckControl
        })}`
      );
    });
    const hidden = Math.max(0, rows.length - 30);
    return {
      ok: true,
      message:
        `Owned gear: ${rows.length}\n` +
        `${lines.join('\n')}` +
        `${hidden > 0 ? `\n...and ${hidden} more.` : ''}`
    };
  }

  public async gearEquip(
    discordId: string,
    username: string,
    slotInput: string,
    gearId: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const slot = slotInput.toLowerCase() as GearSlot;
    if (!this.gearSlots().includes(slot)) return { ok: false, message: 'Invalid gear slot.' };
    const row = db
      .select()
      .from(gearInstances)
      .where(and(eq(gearInstances.id, gearId), eq(gearInstances.userId, user.id)))
      .get();
    if (!row) return { ok: false, message: 'Gear not found.' };
    if (row.slot !== slot) return { ok: false, message: `Gear #${gearId} fits slot ${row.slot}, not ${slot}.` };
    db.insert(userGearEquips)
      .values({ userId: user.id, slot, gearInstanceId: row.id, equippedAt: nowMs() })
      .onConflictDoUpdate({
        target: [userGearEquips.userId, userGearEquips.slot],
        set: { gearInstanceId: row.id, equippedAt: nowMs() }
      })
      .run();
    return { ok: true, message: `Equipped ${row.name} (#${row.id}) to ${slot}.` };
  }

  public async gearUnequip(
    discordId: string,
    username: string,
    slotInput: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const slot = slotInput.toLowerCase() as GearSlot;
    if (!this.gearSlots().includes(slot)) return { ok: false, message: 'Invalid gear slot.' };
    const existing = db
      .select()
      .from(userGearEquips)
      .where(and(eq(userGearEquips.userId, user.id), eq(userGearEquips.slot, slot)))
      .get();
    if (!existing) return { ok: false, message: `No gear equipped in slot ${slot}.` };
    db
      .delete(userGearEquips)
      .where(and(eq(userGearEquips.userId, user.id), eq(userGearEquips.slot, slot)))
      .run();
    return { ok: true, message: `Unequipped slot ${slot}.` };
  }

  public async forgeMaterials(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.ensureMaterialRows(user.id);
    const lines = MATERIAL_KEYS.map((key) => `${key}: ${this.materialAmount(user.id, key)}`);
    return { ok: true, message: lines.join('\n') };
  }

  public async forgeRecipes(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.ensureClassProgressRow(user.id);
    const lines = BOSS_GEAR_RECIPES.map(
      (entry) =>
        `${entry.id}: ${entry.itemName} [${entry.rarity}] (${entry.slot}) | set ${entry.setName} | fee ${entry.fee}`
    );
    return { ok: true, message: lines.join('\n') };
  }

  public async forgePreview(
    discordId: string,
    username: string,
    recipeId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.ensureMaterialRows(user.id);
    const recipe = BOSS_GEAR_RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) return { ok: false, message: `Recipe not found: ${recipeId}` };
    const materialLines = (Object.entries(recipe.materials) as Array<[MaterialKey, number]>).map(
      ([key, amount]) => `${key}: need ${amount}, owned ${this.materialAmount(user.id, key)}`
    );
    return {
      ok: true,
      message:
        `${recipe.itemName} [${recipe.rarity}] (${recipe.slot})\n` +
        `Set: ${recipe.setName}\n` +
        `Class affinity: ${recipe.classAffinity}\n` +
        `Fee: ${recipe.fee} Molgium\n` +
        `Stats: ${recipe.statRanges
          .map((range) => `${range.key} ${range.min}-${range.max}`)
          .join(', ')}\n` +
        `Materials:\n${materialLines.join('\n')}`
    };
  }

  public async forgeCraft(
    discordId: string,
    username: string,
    recipeId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'crafting in forge');
    if (!debtLock.ok) return debtLock;
    this.ensureMaterialRows(user.id);
    const classRow = this.ensureClassProgressRow(user.id);
    if (!classRow.baseClassKey) return { ok: false, message: 'Pick a class first with /class choose.' };
    const recipe = BOSS_GEAR_RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) return { ok: false, message: `Recipe not found: ${recipeId}` };

    let newBalance = 0;
    let craftedId = 0;
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing.');
        if (wallet.amount < recipe.fee) throw new Error('Not enough Molgium for forge fee.');
        for (const [key, required] of Object.entries(recipe.materials) as Array<[MaterialKey, number]>) {
          const row = tx
            .select()
            .from(craftingMaterials)
            .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, key)))
            .get();
          if (!row || row.amount < required) throw new Error(`Missing materials: ${key}.`);
        }
        for (const [key, required] of Object.entries(recipe.materials) as Array<[MaterialKey, number]>) {
          const row = tx
            .select()
            .from(craftingMaterials)
            .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, key)))
            .get();
          if (!row) throw new Error('Material row missing.');
          tx
            .update(craftingMaterials)
            .set({ amount: row.amount - required, updatedAt: nowMs() })
            .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, key)))
            .run();
        }
        newBalance = wallet.amount - recipe.fee;
        tx.update(balances).set({ amount: newBalance }).where(eq(balances.userId, user.id)).run();

        const rolled = rollStatsFromRanges(recipe.statRanges);
        const scaled = this.multiplyStats(rolled, rarityMultiplier(recipe.rarity));
        craftedId = this.createGearInstance(tx, {
          userId: user.id,
          templateKey: recipe.id,
          name: recipe.itemName,
          slot: recipe.slot,
          rarity: recipe.rarity,
          classAffinity: recipe.classAffinity,
          setKey: recipe.setKey,
          source: 'forge',
          stats: scaled
        });
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Forge crafting failed.' };
    }

    return {
      ok: true,
      message:
        `Crafted ${recipe.itemName} (#${craftedId}).\n` +
        `Set: ${recipe.setName}\n` +
        `New balance: ${newBalance} Molgium.`
    };
  }

  public async forgeSalvage(
    discordId: string,
    username: string,
    gearId: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.ensureMaterialRows(user.id);
    const gear = db
      .select()
      .from(gearInstances)
      .where(and(eq(gearInstances.id, gearId), eq(gearInstances.userId, user.id)))
      .get();
    if (!gear) return { ok: false, message: 'Gear not found.' };
    const equipRow = db.select().from(userGearEquips).where(eq(userGearEquips.gearInstanceId, gear.id)).get();
    if (equipRow) return { ok: false, message: 'Unequip this gear before salvaging.' };

    const rewards: Record<MaterialKey, number> = {
      scrap: gear.rarity === 'Common' ? 2 : gear.rarity === 'Rare' ? 3 : 5,
      core: gear.rarity === 'Legendary' || gear.rarity === 'Mythic' || gear.rarity === 'God' ? 1 : 0,
      prism: gear.rarity === 'Mythic' || gear.rarity === 'God' ? 1 : 0,
      void_alloy: gear.rarity === 'God' ? 1 : 0,
      boss_core: 0
    };

    db.transaction((tx) => {
      tx.delete(gearInstances).where(eq(gearInstances.id, gear.id)).run();
      for (const [key, amount] of Object.entries(rewards) as Array<[MaterialKey, number]>) {
        if (amount <= 0) continue;
        const row = tx
          .select()
          .from(craftingMaterials)
          .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, key)))
          .get();
        if (!row) continue;
        tx
          .update(craftingMaterials)
          .set({ amount: row.amount + amount, updatedAt: nowMs() })
          .where(and(eq(craftingMaterials.userId, user.id), eq(craftingMaterials.materialKey, key)))
          .run();
      }
    });

    const rewardText = (Object.entries(rewards) as Array<[MaterialKey, number]>)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => `${key} +${amount}`)
      .join(', ');

    return { ok: true, message: `Salvaged ${gear.name}. Materials gained: ${rewardText || 'none'}.` };
  }

  private raidCooldownKey(userId: number): string {
    return `raid:cooldown_until:${userId}`;
  }

  private raidRecentEncountersKey(): string {
    return 'raid:recent_encounters';
  }

  private raidCooldownRemainingMs(userId: number): number {
    const cooldownUntil = this.getStateNumber(this.raidCooldownKey(userId)) ?? 0;
    return Math.max(0, cooldownUntil - nowMs());
  }

  private setRaidCooldown(userId: number): void {
    this.setState(this.raidCooldownKey(userId), String(nowMs() + RAID_COOLDOWN_MS));
  }

  private randomLobbyCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[randomIntInclusive(0, alphabet.length - 1)];
    }
    return code;
  }

  private pruneExpiredRaidLobbies(): void {
    const now = nowMs();
    const expired = db
      .select()
      .from(raidLobbies)
      .where(and(eq(raidLobbies.status, 'open'), sql`${raidLobbies.expiresAt} < ${now}`))
      .all();
    for (const lobby of expired) {
      db
        .update(raidLobbies)
        .set({ status: 'expired', endedAt: now })
        .where(eq(raidLobbies.id, lobby.id))
        .run();
    }
  }

  private activeLobbyForUser(userId: number): typeof raidLobbies.$inferSelect | null {
    this.pruneExpiredRaidLobbies();
    const memberRows = db.select().from(raidLobbyMembers).where(eq(raidLobbyMembers.userId, userId)).all();
    for (const member of memberRows) {
      const lobby = db
        .select()
        .from(raidLobbies)
        .where(
          and(
            eq(raidLobbies.id, member.lobbyId),
            or(eq(raidLobbies.status, 'open'), eq(raidLobbies.status, 'running'))
          )
        )
        .get();
      if (lobby) return lobby;
    }
    return null;
  }

  private raidMemberUsernames(lobbyId: number): Array<{ userId: number; username: string }> {
    const memberRows = db.select().from(raidLobbyMembers).where(eq(raidLobbyMembers.lobbyId, lobbyId)).all();
    return memberRows.map((member) => {
      const user = db.select().from(users).where(eq(users.id, member.userId)).get();
      return { userId: member.userId, username: user?.username ?? `user-${member.userId}` };
    });
  }

  public async raidCreate(
    discordId: string,
    username: string,
    bossKey: RaidBossKey,
    difficulty: RaidDifficultyKey,
    channelId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'starting raids');
    if (!debtLock.ok) return debtLock;
    const classRow = this.ensureClassProgressRow(user.id);
    if (!classRow.baseClassKey) {
      return { ok: false, message: 'Pick your starter class first with /class choose.' };
    }
    if (!RAID_DIFFICULTIES[difficulty]) return { ok: false, message: 'Invalid difficulty.' };
    if (!RAID_BOSSES.some((entry) => entry.key === bossKey)) return { ok: false, message: 'Invalid boss.' };
    const cooldownMs = this.raidCooldownRemainingMs(user.id);
    if (cooldownMs > 0) {
      return { ok: false, message: `Raid cooldown active: ${Math.ceil(cooldownMs / 60000)}m remaining.` };
    }
    if (this.activeLobbyForUser(user.id)) return { ok: false, message: 'You are already in an active lobby.' };
    const entryFee = RAID_ENTRY_FEES[difficulty];
    const wipePenalty = raidWipePenalty(difficulty);

    let code = this.randomLobbyCode();
    for (let i = 0; i < 10; i += 1) {
      const exists = db.select().from(raidLobbies).where(eq(raidLobbies.code, code)).get();
      if (!exists) break;
      code = this.randomLobbyCode();
    }

    const lobbyInserted = db
      .insert(raidLobbies)
      .values({
        code,
        ownerUserId: user.id,
        bossKey,
        difficulty,
        status: 'open',
        channelId,
        createdAt: nowMs(),
        expiresAt: nowMs() + RAID_LOBBY_WINDOW_MS,
        startedAt: null,
        endedAt: null
      })
      .run();
    const lobbyId = Number(lobbyInserted.lastInsertRowid);
    db.insert(raidLobbyMembers).values({ lobbyId, userId: user.id, joinedAt: nowMs() }).run();

    return {
      ok: true,
      message:
        `Raid lobby created: ${code}\n` +
        `Boss: ${bossKey}\nDifficulty: ${difficulty}\n` +
        `Entry fee: ${entryFee} each\n` +
        `Wipe penalty: ${wipePenalty} each\n` +
        `Raid sink split: 50% Treasury / 50% burn\n` +
        `Lobby expires in 2 minutes.\nUse /raid join code:${code}`
    };
  }

  public async raidJoin(
    discordId: string,
    username: string,
    codeRaw: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'joining raids');
    if (!debtLock.ok) return debtLock;
    const cooldownMs = this.raidCooldownRemainingMs(user.id);
    if (cooldownMs > 0) {
      return { ok: false, message: `Raid cooldown active: ${Math.ceil(cooldownMs / 60000)}m remaining.` };
    }
    if (this.activeLobbyForUser(user.id)) return { ok: false, message: 'You are already in an active lobby.' };
    const code = codeRaw.trim().toUpperCase();
    const lobby = db
      .select()
      .from(raidLobbies)
      .where(and(eq(raidLobbies.code, code), eq(raidLobbies.status, 'open')))
      .get();
    if (!lobby) return { ok: false, message: `Lobby not found for code ${code}.` };
    if (lobby.expiresAt < nowMs()) return { ok: false, message: 'Lobby expired.' };
    const memberCount = db.select().from(raidLobbyMembers).where(eq(raidLobbyMembers.lobbyId, lobby.id)).all().length;
    if (memberCount >= RAID_MAX_PARTY_SIZE) return { ok: false, message: 'Lobby is full.' };
    db.insert(raidLobbyMembers)
      .values({ lobbyId: lobby.id, userId: user.id, joinedAt: nowMs() })
      .onConflictDoNothing()
      .run();
    return { ok: true, message: `Joined raid lobby ${code}.` };
  }

  public async raidLeave(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const lobby = this.activeLobbyForUser(user.id);
    if (!lobby || lobby.status !== 'open') return { ok: false, message: 'No open lobby to leave.' };
    if (lobby.ownerUserId === user.id) {
      db.update(raidLobbies).set({ status: 'canceled', endedAt: nowMs() }).where(eq(raidLobbies.id, lobby.id)).run();
      return { ok: true, message: `Lobby ${lobby.code} canceled by owner.` };
    }
    db
      .delete(raidLobbyMembers)
      .where(and(eq(raidLobbyMembers.lobbyId, lobby.id), eq(raidLobbyMembers.userId, user.id)))
      .run();
    return { ok: true, message: `Left lobby ${lobby.code}.` };
  }

  public async raidStatus(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const lobby = this.activeLobbyForUser(user.id);
    if (!lobby) return { ok: false, message: 'You are not in an active raid lobby.' };
    const members = this.raidMemberUsernames(lobby.id);
    return {
      ok: true,
      message:
        `Lobby ${lobby.code} [${lobby.status}]\n` +
        `Boss: ${lobby.bossKey}\nDifficulty: ${lobby.difficulty}\n` +
        `Members (${members.length}/${RAID_MAX_PARTY_SIZE}): ${members.map((member) => member.username).join(', ')}`
    };
  }

  public async raidHistory(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const rows = db
      .select()
      .from(raidRunMembers)
      .where(eq(raidRunMembers.userId, user.id))
      .orderBy(desc(raidRunMembers.id))
      .limit(12)
      .all();
    if (rows.length === 0) return { ok: true, message: 'No raid history yet.' };
    const lines = rows.map((row) => {
      const run = db.select().from(raidRuns).where(eq(raidRuns.id, row.runId)).get();
      if (!run) return `Run ${row.runId}: missing`;
      return (
        `Run #${run.id} ${run.bossKey} [${run.difficulty}] - ${run.victory === 1 ? 'WIN' : 'LOSS'} | ` +
        `reward ${row.rewardMolgium} Molgium${row.eggDropped ? ' +egg' : ''}`
      );
    });
    return { ok: true, message: lines.join('\n') };
  }

  public async raidStart(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'starting raids');
    if (!debtLock.ok) return debtLock;
    const lobby = this.activeLobbyForUser(user.id);
    if (!lobby) return { ok: false, message: 'No active lobby found.' };
    if (lobby.status !== 'open') return { ok: false, message: 'Lobby is not startable.' };
    if (lobby.ownerUserId !== user.id) return { ok: false, message: 'Only the lobby owner can start the raid.' };

    const members = this.raidMemberUsernames(lobby.id);
    if (members.length < RAID_MIN_PARTY_SIZE) {
      return { ok: false, message: `Need at least ${RAID_MIN_PARTY_SIZE} players to start.` };
    }

    const entryFee = RAID_ENTRY_FEES[lobby.difficulty as RaidDifficultyKey];
    const wipePenalty = raidWipePenalty(lobby.difficulty as RaidDifficultyKey);
    const cannotAffordEntry = members
      .map((member) => ({
        username: member.username,
        balance: this.currentBalance(member.userId)
      }))
      .filter((entry) => entry.balance < entryFee);
    if (cannotAffordEntry.length > 0) {
      return {
        ok: false,
        message:
          `Raid start blocked. Entry fee is ${entryFee} Molgium per player.\n` +
          `Missing funds: ${cannotAffordEntry
            .map((entry) => `${entry.username} (${entry.balance})`)
            .join(', ')}`
      };
    }

    let entryTreasuryAdded = 0;
    let entryBurned = 0;
    for (const member of members) {
      try {
        const entryCharge = this.applyRaidCharge(member.userId, entryFee, false);
        entryTreasuryAdded += entryCharge.treasuryAdded;
        entryBurned += entryCharge.burned;
      } catch (error) {
        return {
          ok: false,
          message: `Raid start blocked: failed charging entry fee for ${member.username}. ${error instanceof Error ? error.message : ''}`.trim()
        };
      }
    }

    db.update(raidLobbies).set({ status: 'running', startedAt: nowMs() }).where(eq(raidLobbies.id, lobby.id)).run();
    const difficulty = RAID_DIFFICULTIES[lobby.difficulty as RaidDifficultyKey];
    const previous = this.getState(this.raidRecentEncountersKey());
    const recent = previous ? (JSON.parse(previous) as string[]) : [];
    const generated = generateRaidEncounters(lobby.bossKey as RaidBossKey, recent);
    const stages = generated.stages;

    const memberPower = members.map((member) => ({
      ...member,
      ...this.computeRaidPower(member.userId)
    }));
    const partyPowerBase = memberPower.reduce((sum, member) => sum + member.power, 0);

    await this.sendEventPing(
      `Raid started: ${lobby.code}\nBoss: ${lobby.bossKey}\nDifficulty: ${difficulty.label}\n` +
        `Party (${members.length}): ${members.map((member) => member.username).join(', ')}\n` +
        `Mutator: ${generated.mutator}`,
      'Raid'
    );

    let clearedStages = 0;
    let failedEncounter: string | null = null;
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      const stageHp = Math.floor(stage.hpBase * difficulty.enemyHpMultiplier * (1 + index * 0.12));
      const stageRoll = Math.floor(partyPowerBase * (0.88 + Math.random() * 0.34));
      const won = stageRoll >= stageHp;
      await this.sendEventMessage(
        [
          `Encounter ${index + 1}/${stages.length}: ${stage.portrait} ${stage.name} [${stage.kind.toUpperCase()}]`,
          `Modifier: ${stage.modifier}`,
          `Enemy HP: ${stageHp}`,
          `Party Power Roll: ${stageRoll}`,
          won ? 'Result: CLEARED' : 'Result: FAILED'
        ].join('\n'),
        stage.kind === 'boss' ? 'Raid Boss' : 'Raid Encounter'
      );
      await sleep(900);
      if (!won) {
        failedEncounter = stage.name;
        break;
      }
      clearedStages += 1;
    }

    const victory = clearedStages === stages.length;
    const runInsert = db
      .insert(raidRuns)
      .values({
        lobbyId: lobby.id,
        bossKey: lobby.bossKey,
        difficulty: lobby.difficulty,
        mutator: generated.mutator,
        stageCount: stages.length,
        status: 'completed',
        victory: victory ? 1 : 0,
        startedAt: lobby.startedAt ?? nowMs(),
        endedAt: nowMs(),
        summaryJson: JSON.stringify({
          members: members.map((member) => member.username),
          clearedStages,
          failedEncounter
        })
      })
      .run();
    const runId = Number(runInsert.lastInsertRowid);

    const recentKeys = [...recent, ...stages.map((stage) => stage.key)].slice(-15);
    this.setState(this.raidRecentEncountersKey(), JSON.stringify(recentKeys));

    const rewardLines: string[] = [];
    let wipeTreasuryAdded = 0;
    let wipeBurned = 0;
    for (const member of memberPower) {
      this.ensureMaterialRows(member.userId);
      const activePet = await this.getActivePet(member.userId);
      const raidLootBonusChance =
        activePet?.petType === 'Raid' ? PET_RAID_LOOT_BONUS_CHANCE[activePet.rarity] : 0;
      const raidMolgiumWinBonusRate =
        victory && activePet?.petType === 'Raid' ? PET_RAID_MOLGIUM_WIN_BONUS[activePet.rarity] : 0;
      const rollWithLootBonus = (baseChance: number): boolean =>
        Math.random() < Math.min(0.95, Math.max(0, baseChance + raidLootBonusChance));

      const basePayout = victory
        ? randomIntInclusive(difficulty.payoutMin, difficulty.payoutMax)
        : Math.floor(randomIntInclusive(difficulty.payoutMin, difficulty.payoutMax) * 0.25);
      const payout = victory ? basePayout + Math.floor(basePayout * raidMolgiumWinBonusRate) : basePayout;
      const materialDrops: Partial<Record<MaterialKey, number>> = {
        scrap: Math.max(1, Math.floor(randomIntInclusive(2, 5) * difficulty.materialMultiplier))
      };
      if (victory && rollWithLootBonus(0.55)) materialDrops.core = randomIntInclusive(1, 2);
      if (victory && rollWithLootBonus(0.35)) materialDrops.prism = 1;
      if (victory && rollWithLootBonus(0.22)) materialDrops.void_alloy = 1;
      if (victory && rollWithLootBonus(difficulty.bossCoreDropChance)) materialDrops.boss_core = 1;
      const eggDrop = victory && rollWithLootBonus(difficulty.eggDropChance) ? 1 : 0;

      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, member.userId)).get();
        if (!wallet) throw new Error('Wallet missing during raid payout.');
        tx
          .update(balances)
          .set({ amount: wallet.amount + payout })
          .where(eq(balances.userId, member.userId))
          .run();
        for (const [key, amount] of Object.entries(materialDrops) as Array<[MaterialKey, number | undefined]>) {
          if (!amount || amount <= 0) continue;
          const row = tx
            .select()
            .from(craftingMaterials)
            .where(and(eq(craftingMaterials.userId, member.userId), eq(craftingMaterials.materialKey, key)))
            .get();
          if (!row) continue;
          tx
            .update(craftingMaterials)
            .set({ amount: row.amount + amount, updatedAt: nowMs() })
            .where(and(eq(craftingMaterials.userId, member.userId), eq(craftingMaterials.materialKey, key)))
            .run();
        }
        if (eggDrop > 0) {
          const eggRow = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, member.userId)).get();
          if (eggRow) {
            tx
              .update(eggsInventory)
              .set({ eggs: eggRow.eggs + 1 })
              .where(eq(eggsInventory.userId, member.userId))
              .run();
          }
        }
      });

      this.setRaidCooldown(member.userId);
      db.insert(raidRunMembers)
        .values({
          runId,
          userId: member.userId,
          contribution: member.power,
          rewardMolgium: payout,
          eggDropped: eggDrop,
          materialsJson: JSON.stringify(materialDrops),
          createdAt: nowMs()
        })
        .run();

      const raidPetBonusText =
        activePet?.petType === 'Raid'
          ? ` | raid pet bonus: +${formatPercent(raidLootBonusChance * 100)} loot chance${victory ? `, +${formatPercent(raidMolgiumWinBonusRate * 100)} Molgium on win` : ''}`
          : '';
      let wipeText = '';
      if (!victory) {
        const wipeCharge = this.applyRaidCharge(member.userId, wipePenalty, true);
        wipeTreasuryAdded += wipeCharge.treasuryAdded;
        wipeBurned += wipeCharge.burned;
        if (wipeCharge.charged <= 0) {
          wipeText = ` | wipe penalty ${wipePenalty}, paid 0 (debt floor ${RAID_DEBT_MIN_BALANCE})`;
        } else if (wipeCharge.capped) {
          wipeText = ` | wipe penalty ${wipePenalty}, paid ${wipeCharge.charged} (capped at debt floor ${RAID_DEBT_MIN_BALANCE})`;
        } else {
          wipeText = ` | wipe penalty paid ${wipeCharge.charged}`;
        }
      }
      rewardLines.push(
        `${member.username}: +${payout} Molgium${eggDrop ? ' +1 egg' : ''} | materials ${JSON.stringify(materialDrops)}${raidPetBonusText}${wipeText}`
      );
    }

    db
      .update(raidLobbies)
      .set({ status: victory ? 'completed' : 'failed', endedAt: nowMs() })
      .where(eq(raidLobbies.id, lobby.id))
      .run();

    await this.sendEventPing(
      [
        victory
          ? `Raid clear: ${lobby.bossKey} on ${difficulty.label}.`
          : `Raid failed at ${failedEncounter ?? 'an encounter'} (${clearedStages}/${stages.length} cleared).`,
        `Entry fee: ${entryFee} each (Treasury +${entryTreasuryAdded}, Burned ${entryBurned})`,
        `${victory ? 'Wipe penalty: none' : `Wipe penalty: ${wipePenalty} each (Treasury +${wipeTreasuryAdded}, Burned ${wipeBurned})`}`,
        `Raid debt floor: ${RAID_DEBT_MIN_BALANCE}`,
        'Rewards:',
        ...rewardLines
      ].join('\n'),
      'Raid Results'
    );

    return {
      ok: victory,
      message: victory
        ? 'Raid completed. Check Special Place for staged encounter logs and rewards.'
        : `Raid failed at ${failedEncounter ?? 'an encounter'}. Rewards were reduced but granted.`
    };
  }

  private ensurePetFlavor(
    pet: Pick<typeof petInstances.$inferSelect, 'id' | 'petType' | 'generatedName' | 'generatedTypeLabel'>
  ): { generatedName: string; generatedTypeLabel: string } {
    const hasName = pet.generatedName && pet.generatedName !== 'mystery companion';
    const hasType = pet.generatedTypeLabel && pet.generatedTypeLabel !== 'fisher type';
    const generatedName = hasName ? pet.generatedName : generateCreatureName();
    const generatedTypeLabel = hasType ? pet.generatedTypeLabel : `${pet.petType.toLowerCase()} type`;
    if (!hasName || !hasType) {
      db.update(petInstances)
        .set({ generatedName, generatedTypeLabel })
        .where(eq(petInstances.id, pet.id))
        .run();
    }
    return { generatedName, generatedTypeLabel };
  }

  private async getActivePet(userId: number): Promise<{
    petInstanceId: number;
    petType: PetType;
    rarity: Rarity;
    generatedName: string;
    generatedTypeLabel: string;
  } | null> {
    const row = db.select().from(activePet).where(eq(activePet.userId, userId)).get();
    if (!row?.petInstanceId) return null;
    const pet = db
      .select()
      .from(petInstances)
      .where(and(eq(petInstances.id, row.petInstanceId), eq(petInstances.status, 'kept')))
      .get();
    if (!pet) return null;
    const flavor = this.ensurePetFlavor(pet);
    return {
      petInstanceId: pet.id,
      petType: pet.petType as PetType,
      rarity: pet.rarity as Rarity,
      generatedName: flavor.generatedName,
      generatedTypeLabel: flavor.generatedTypeLabel
    };
  }

  public async claimWork(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.noteUserActive(discordId);
    if (isSameWorkWindow(user.lastWorkAt ?? null, nowMs(), appEnv.TIMEZONE, DAILY_RESET_HOUR)) {
      const next = this.currentWindowStart() + 24 * 60 * 60 * 1000;
      return {
        ok: false,
        message: `Already worked this reset window. Next /work at ${DateTime.fromMillis(next, {
          zone: appEnv.TIMEZONE
        }).toFormat('HH:mm')}.`
      };
    }
    const activePetInfo = await this.getActivePet(user.id);
    const workerMultiplier = activePetInfo?.petType === 'Worker' ? PET_WORKER_MULTIPLIER[activePetInfo.rarity] : 1;
    const inflationMultiplier = this.isBoostActive('event:inflation_until') ? 2 : 1;
    const streak = this.updateWorkStreak(user.id);
    const streakMultiplier = 1 + streak.bonusPct;
    const payout = Math.floor(user.salaryBase * workerMultiplier * inflationMultiplier * streakMultiplier);
    const gotRobbed = rollChance(WORK_ROBBERY_CHANCE);
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
      if (!wallet) throw new Error('Wallet missing');
      tx.update(users).set({ lastWorkAt: nowMs(), updatedAt: nowMs() }).where(eq(users.id, user.id)).run();
      const nextBalance = gotRobbed ? wallet.amount : wallet.amount + payout;
      tx.update(balances).set({ amount: nextBalance }).where(eq(balances.userId, user.id)).run();
    });
    this.incrementMissionMetric(user.id, 'work_claim', 1);
    if (gotRobbed) {
      return {
        ok: true,
        message:
          `You got robbed on the way to work. Today paid 0 Molgium (lost ${payout}). ` +
          `Work streak: ${streak.streak} (+${formatPercent(streak.bonusPct * 100)}).`
      };
    }
    return {
      ok: true,
      message:
        `You earned ${payout} Molgium from /work. ` +
        `Work streak: ${streak.streak} (+${formatPercent(streak.bonusPct * 100)}).`
    };
  }

  public async jobList(discordId: string, username: string): Promise<{
    currentSalaryBase: number;
    tiers: Array<{ id: number; cost: number; newSalaryBase: number; owned: boolean }>;
  }> {
    const user = await this.ensureUser(discordId, username);
    const owned = db.select().from(raisesOwned).where(eq(raisesOwned.userId, user.id)).all();
    const ownedSet = new Set(owned.map((entry) => entry.raiseId));
    return {
      currentSalaryBase: user.salaryBase,
      tiers: RAISE_TIERS.map((tier) => ({ ...tier, owned: ownedSet.has(tier.id) }))
    };
  }

  public async jobApply(
    discordId: string,
    username: string,
    jobId: number
  ): Promise<{ ok: boolean; message: string; hired?: boolean }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'applying for jobs');
    if (!debtLock.ok) return debtLock;
    const tier = RAISE_TIERS.find((entry) => entry.id === jobId);
    if (!tier) return { ok: false, message: 'Invalid job id.' };
    const owned = db.select().from(raisesOwned).where(eq(raisesOwned.userId, user.id)).all();
    if (owned.some((entry) => entry.raiseId === jobId)) return { ok: false, message: 'Job already acquired.' };
    const maxOwned = owned.reduce((max, current) => Math.max(max, current.raiseId), 0);
    if (jobId > maxOwned + 1) return { ok: false, message: 'Apply for jobs in order.' };
    const hired = Math.random() < 0.5;
    let newBalance = 0;
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        if (wallet.amount < tier.cost) throw new Error('Insufficient Molgium');
        newBalance = wallet.amount - tier.cost;
        tx.update(balances).set({ amount: newBalance }).where(eq(balances.userId, user.id)).run();
        if (hired) {
          tx.insert(raisesOwned).values({ userId: user.id, raiseId: jobId, purchasedAt: nowMs() }).run();
          tx.update(users).set({ salaryBase: tier.newSalaryBase, updatedAt: nowMs() }).where(eq(users.id, user.id)).run();
        }
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Job application failed.' };
    }
    if (!hired) {
      return {
        ok: true,
        hired: false,
        message:
          `Interview failed for job ${jobId}. Application fee ${tier.cost} Molgium was spent. ` +
          `New balance: ${newBalance} Molgium.`
      };
    }
    return {
      ok: true,
      hired: true,
      message:
        `Interview passed for job ${jobId}. SalaryBase now ${tier.newSalaryBase}. ` +
        `New balance: ${newBalance} Molgium.`
    };
  }

  private bestOwnedRodTier(owned: Array<{ tier: RodTier }>): RodTier | null {
    if (owned.length === 0) return null;
    return owned.reduce(
      (bestTier, row) => (rodTierRank[row.tier] > rodTierRank[bestTier] ? row.tier : bestTier),
      owned[0]!.tier
    );
  }

  private rodStatsSummary(tier: RodTier): string {
    const config = ROD_CONFIG[tier];
    const trashReduction = Math.max(0, (1 - config.trashWeightMultiplier) * 100);
    const sellBonus = Math.max(0, (config.sellBonusMultiplier - 1) * 100);
    const doubleSellChance = config.doubleSellChance * 100;
    const rarityBumpChance = config.rarityBumpChance * 100;
    const cooldownMinutes = Math.round(config.cooldownMs / 60_000);
    return `cooldown ${cooldownMinutes}m, trash -${formatPercent(trashReduction)}, sell +${formatPercent(sellBonus)}, double +${formatPercent(doubleSellChance)}, rarity bump +${formatPercent(rarityBumpChance)}`;
  }

  private rodUpgradeSummary(targetTier: RodTier, comparedToTier: RodTier | null): string {
    if (!comparedToTier) {
      return `Rod stats: ${this.rodStatsSummary(targetTier)}.`;
    }
    const target = ROD_CONFIG[targetTier];
    const current = ROD_CONFIG[comparedToTier];
    const trashDelta = (current.trashWeightMultiplier - target.trashWeightMultiplier) * 100;
    const sellDelta = (target.sellBonusMultiplier - current.sellBonusMultiplier) * 100;
    const doubleDelta = (target.doubleSellChance - current.doubleSellChance) * 100;
    const rarityDelta = (target.rarityBumpChance - current.rarityBumpChance) * 100;
    const cooldownDeltaMinutes = Math.round((target.cooldownMs - current.cooldownMs) / 60_000);
    return [
      `Compared to ${current.name}:`,
      `cooldown ${formatSignedMinutes(cooldownDeltaMinutes)}, trash ${formatSignedPercent(trashDelta)}, sell ${formatSignedPercent(sellDelta)}, double ${formatSignedPercent(doubleDelta)}, rarity bump ${formatSignedPercent(rarityDelta)}.`
    ].join(' ');
  }

  public async rodShop(discordId: string, username: string): Promise<
    Array<{
      tier: RodTier;
      cost: number;
      name: string;
      owned: boolean;
      equipped: boolean;
      statsSummary: string;
    }>
  > {
    const user = await this.ensureUser(discordId, username);
    const owned = db.select().from(rodsOwned).where(eq(rodsOwned.userId, user.id)).all();
    return (Object.keys(ROD_CONFIG) as RodTier[]).map((tier) => ({
      tier,
      cost: ROD_CONFIG[tier].cost,
      name: ROD_CONFIG[tier].name,
      owned: owned.some((entry) => entry.tier === tier),
      equipped: owned.some((entry) => entry.tier === tier && entry.equipped === 1),
      statsSummary: this.rodStatsSummary(tier)
    }));
  }

  public async rodBuy(
    discordId: string,
    username: string,
    tier: RodTier
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    if (!ROD_CONFIG[tier]) return { ok: false, message: 'Unknown rod tier.' };
    const ownedBefore = db
      .select({ tier: rodsOwned.tier })
      .from(rodsOwned)
      .where(eq(rodsOwned.userId, user.id))
      .all()
      .map((entry) => ({ tier: entry.tier as RodTier }));
    const comparedToTier = this.bestOwnedRodTier(ownedBefore);
    const hasRod = db
      .select()
      .from(rodsOwned)
      .where(and(eq(rodsOwned.userId, user.id), eq(rodsOwned.tier, tier)))
      .get();
    if (hasRod) return { ok: false, message: 'You already own this rod.' };
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        if (wallet.amount < ROD_CONFIG[tier].cost) throw new Error('Insufficient Molgium');
        tx
          .update(balances)
          .set({ amount: wallet.amount - ROD_CONFIG[tier].cost })
          .where(eq(balances.userId, user.id))
          .run();
        tx
          .insert(rodsOwned)
          .values({ userId: user.id, tier, equipped: 0, purchasedAt: nowMs() })
          .run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Rod purchase failed.' };
    }
    const unlockNote =
      tier === 'starter' && comparedToTier === null
        ? 'This unlocks fishing once you equip it.'
        : `Use /rod equip tier:${tier} to equip it.`;
    return {
      ok: true,
      message: `${ROD_CONFIG[tier].name} purchased.\n${this.rodUpgradeSummary(tier, comparedToTier)}\n${unlockNote}`
    };
  }

  public async rodEquip(
    discordId: string,
    username: string,
    tier: RodTier
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const row = db
      .select()
      .from(rodsOwned)
      .where(and(eq(rodsOwned.userId, user.id), eq(rodsOwned.tier, tier)))
      .get();
    if (!row) return { ok: false, message: 'You do not own this rod.' };
    db.transaction((tx) => {
      tx.update(rodsOwned).set({ equipped: 0 }).where(eq(rodsOwned.userId, user.id)).run();
      tx
        .update(rodsOwned)
        .set({ equipped: 1 })
        .where(and(eq(rodsOwned.userId, user.id), eq(rodsOwned.tier, tier)))
        .run();
    });
    return { ok: true, message: `Equipped ${ROD_CONFIG[tier].name}.` };
  }

  private currentSeasonKey(): string {
    const month = DateTime.now().setZone(appEnv.TIMEZONE).toFormat('LLLL').toLowerCase();
    return FISH_SEASONS[month] ? month : 'default';
  }

  public async fishCast(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    this.noteUserActive(discordId);
    const rod = db
      .select()
      .from(rodsOwned)
      .where(and(eq(rodsOwned.userId, user.id), eq(rodsOwned.equipped, 1)))
      .get();
    if (!rod) return { ok: false, message: 'No equipped rod. Buy and equip one with /rod.' };
    const rodTier = rod.tier as RodTier;
    const rodConfig = ROD_CONFIG[rodTier];
    const rodCooldownMs = rodConfig.cooldownMs;
    const cooldownKey = `fish:last:${user.id}`;
    const lastCast = this.getStateNumber(cooldownKey);
    if (lastCast && nowMs() - lastCast < rodCooldownMs) {
      const readyAtMs = lastCast + rodCooldownMs;
      const readyAtUnix = Math.floor(readyAtMs / 1000);
      return {
        ok: false,
        message: `Fishing cooldown active. Try again <t:${readyAtUnix}:R> (at <t:${readyAtUnix}:t>).`
      };
    }
    let rarity = rollFishRarity(rodTier, this.isBoostActive('event:fishing_madness_until'));
    let upgradedToGodByRod = false;
    if (Math.random() < rodConfig.rarityBumpChance) {
      const bumped = bumpFishRarity(rarity);
      upgradedToGodByRod = rarity === 'Mythic' && bumped === 'God';
      rarity = bumped;
    }
    const active = await this.getActivePet(user.id);
    if (active?.petType === 'Fisher' && Math.random() < PET_FISHER_BUMP_CHANCE[active.rarity]) {
      const bumped = bumpFishRarity(rarity);
      if (!(rarity === 'Mythic' && bumped === 'God')) {
        rarity = bumped;
      }
    }
    const seasonKey = this.currentSeasonKey();
    const seasonFish = FISH_SEASONS[seasonKey] ?? FISH_SEASONS.default ?? [];
    const candidates = seasonFish.filter((fish) => fish.rarity === rarity);
    const fish = candidates.length
      ? pickRandom(candidates)
      : rarity === 'Trash'
        ? pickRandom(trashFallbackPool)
        : {
            key: `${rarity.toLowerCase()}_catch`,
            displayName: `${rarity} Catch`,
            rarity
          };
    const [minValue, maxValue] = FISH_BASE_VALUES[rarity];
    let value = Math.floor(randomIntInclusive(minValue, maxValue) * rodConfig.sellBonusMultiplier);
    let doubled = false;
    if (Math.random() < rodConfig.doubleSellChance) {
      value *= 2;
      doubled = true;
    }
    const specialName =
      rarity === 'Legendary' || rarity === 'Mythic' || rarity === 'God'
        ? generateEliteFishName(rarity)
        : rarity === 'Common'
          ? generateBoringCommonFishName()
          : null;
    const enchantment = rollFishEnchantment();
    const baseCaughtName = specialName ?? fish.displayName;
    const caughtName = enchantment ? `${enchantment.label} ${baseCaughtName}` : baseCaughtName;
    if (enchantment) {
      value = Math.max(1, Math.floor(value * enchantment.valueMultiplier));
    }
    const inserted = db
      .insert(fishCatches)
      .values({
        userId: user.id,
        fishKey: fish.key,
        caughtName: caughtName !== fish.displayName ? caughtName : null,
        rarity,
        season: seasonKey,
        baseValue: minValue,
        finalValue: value,
        soldAt: null,
        caughtAt: nowMs()
      })
      .returning()
      .get();
    const collectionRow = db
      .select()
      .from(fishCollection)
      .where(and(eq(fishCollection.userId, user.id), eq(fishCollection.fishKey, fish.key)))
      .get();
    if (!collectionRow) {
      db.insert(fishCollection)
        .values({
          userId: user.id,
          fishKey: fish.key,
          count: 1,
          bestValue: value,
          firstCaughtAt: nowMs(),
          lastCaughtAt: nowMs()
        })
        .run();
    } else {
      db.update(fishCollection)
        .set({
          count: collectionRow.count + 1,
          bestValue: Math.max(collectionRow.bestValue, value),
          lastCaughtAt: nowMs()
        })
        .where(and(eq(fishCollection.userId, user.id), eq(fishCollection.fishKey, fish.key)))
        .run();
    }
    if (rarity === 'Mythic' || rarity === 'God') {
      await this.announceRareFish(user, inserted.id, fish.key, caughtName, rarity, value, upgradedToGodByRod);
    }
    this.setState(cooldownKey, String(nowMs()));
    this.incrementMissionMetric(user.id, 'fish_cast', 1);
    return {
      ok: true,
      message:
        `Caught ${caughtName} [${rarity}]` +
        `${enchantment ? ` [Enchanted: ${enchantment.label}]` : ''}, ` +
        `worth ${value} Molgium (id ${inserted.id})${doubled ? ' [double]' : ''}.`
    };
  }

  public async fishSell(
    discordId: string,
    username: string,
    catchIdOrLast: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const active = await this.getActivePet(user.id);
    const normalizedCatchInput = catchIdOrLast.trim().toLowerCase();
    if (normalizedCatchInput === 'all') {
      const unsoldRows = db
        .select({ id: fishCatches.id, finalValue: fishCatches.finalValue })
        .from(fishCatches)
        .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
        .all();
      if (unsoldRows.length === 0) return { ok: false, message: 'No unsold catch found.' };
      const fisherBonusRate =
        active?.petType === 'Fisher' ? PET_FISHER_SELL_BONUS[active.rarity] : 0;
      const baseTotal = unsoldRows.reduce((sum, row) => sum + row.finalValue, 0);
      const fisherBonusTotal =
        fisherBonusRate > 0
          ? unsoldRows.reduce((sum, row) => sum + Math.floor(row.finalValue * fisherBonusRate), 0)
          : 0;
      const payout = baseTotal + fisherBonusTotal;
      const treasuryDrip = Math.floor(payout * TREASURY_DRIP_FISH_SELL_RATE);
      const payoutAfterDrip = Math.max(0, payout - treasuryDrip);
      let finalBalance = 0;
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
        if (!wallet || !treasuryRow) throw new Error('Wallet/treasury missing');
        tx.update(fishCatches)
          .set({ soldAt: nowMs() })
          .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
          .run();
        finalBalance = wallet.amount + payoutAfterDrip;
        tx.update(balances).set({ amount: finalBalance }).where(eq(balances.userId, user.id)).run();
        if (treasuryDrip > 0) {
          tx
            .update(treasury)
            .set({ amount: treasuryRow.amount + treasuryDrip, updatedAt: nowMs() })
            .where(eq(treasury.id, 1))
            .run();
        }
      });
      this.incrementMissionMetric(user.id, 'fish_sell', unsoldRows.length);
      return {
        ok: true,
        message:
          `Sold ${unsoldRows.length} catches for ${payoutAfterDrip} Molgium` +
          `${fisherBonusTotal > 0 ? ` (${baseTotal} + ${fisherBonusTotal} Fisher bonus)` : ''}. ` +
          `${treasuryDrip > 0 ? `Sell tax: ${Math.round(TREASURY_DRIP_FISH_SELL_RATE * 100)}% (+${treasuryDrip} Treasury). ` : ''}` +
          `New balance: ${finalBalance} Molgium.`
      };
    }
    let row = catchIdOrLast.toLowerCase() === 'last'
      ? db
          .select()
          .from(fishCatches)
          .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
          .orderBy(desc(fishCatches.caughtAt))
          .limit(1)
          .get()
      : undefined;
    if (!row) {
      const id = Number(catchIdOrLast);
      if (!Number.isInteger(id)) return { ok: false, message: 'catch_id must be numeric, "last", or "all".' };
      row = db
        .select()
        .from(fishCatches)
        .where(and(eq(fishCatches.userId, user.id), eq(fishCatches.id, id), isNull(fishCatches.soldAt)))
        .get();
    }
    if (!row) return { ok: false, message: 'No unsold catch found.' };
    const fisherBonus =
      active?.petType === 'Fisher' ? Math.floor(row.finalValue * PET_FISHER_SELL_BONUS[active.rarity]) : 0;
    const payout = row.finalValue + fisherBonus;
    const treasuryDrip = Math.floor(payout * TREASURY_DRIP_FISH_SELL_RATE);
    const payoutAfterDrip = Math.max(0, payout - treasuryDrip);
    let finalBalance = 0;
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
      const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!wallet || !treasuryRow) throw new Error('Wallet/treasury missing');
      tx.update(fishCatches).set({ soldAt: nowMs() }).where(eq(fishCatches.id, row.id)).run();
      finalBalance = wallet.amount + payoutAfterDrip;
      tx.update(balances).set({ amount: finalBalance }).where(eq(balances.userId, user.id)).run();
      if (treasuryDrip > 0) {
        tx
          .update(treasury)
          .set({ amount: treasuryRow.amount + treasuryDrip, updatedAt: nowMs() })
          .where(eq(treasury.id, 1))
          .run();
      }
    });
    this.incrementMissionMetric(user.id, 'fish_sell', 1);
    return {
      ok: true,
      message:
        `Sold catch ${row.id} for ${payoutAfterDrip} Molgium` +
        `${fisherBonus > 0 ? ` (${row.finalValue} + ${fisherBonus} Fisher bonus)` : ''}. ` +
        `${treasuryDrip > 0 ? `Sell tax: ${Math.round(TREASURY_DRIP_FISH_SELL_RATE * 100)}% (+${treasuryDrip} Treasury). ` : ''}` +
        `New balance: ${finalBalance} Molgium.`
    };
  }

  public async fishCollectionView(discordId: string, username: string): Promise<{
    entries: Array<{ fishKey: string; count: number; bestValue: number }>;
    unsold: number;
  }> {
    const user = await this.ensureUser(discordId, username);
    const entries = db
      .select({
        fishKey: fishCollection.fishKey,
        count: fishCollection.count,
        bestValue: fishCollection.bestValue
      })
      .from(fishCollection)
      .where(eq(fishCollection.userId, user.id))
      .orderBy(desc(fishCollection.count))
      .limit(20)
      .all();
    const unsold = Number(
      db
        .select({ count: sql<number>`count(*)` })
        .from(fishCatches)
        .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
        .get()?.count ?? 0
    );
    return { entries, unsold };
  }

  public async fishValueView(discordId: string, username: string): Promise<{
    unsold: number;
    baseTotal: number;
    fisherBonus: number;
    estimatedTotal: number;
    entries: Array<{ name: string; rarity: FishRarity; count: number; totalValue: number }>;
  }> {
    const user = await this.ensureUser(discordId, username);
    const active = await this.getActivePet(user.id);
    const rows = db
      .select({
        fishKey: fishCatches.fishKey,
        rarity: fishCatches.rarity,
        caughtName: fishCatches.caughtName,
        finalValue: fishCatches.finalValue
      })
      .from(fishCatches)
      .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
      .all();

    if (rows.length === 0) {
      return { unsold: 0, baseTotal: 0, fisherBonus: 0, estimatedTotal: 0, entries: [] };
    }

    const fisherBonusRate = active?.petType === 'Fisher' ? PET_FISHER_SELL_BONUS[active.rarity] : 0;
    const byName = new Map<string, { name: string; rarity: FishRarity; count: number; totalValue: number }>();
    let baseTotal = 0;
    let fisherBonus = 0;

    for (const row of rows) {
      const resolved = resolveFishInfo(row.fishKey, row.rarity);
      const name = row.caughtName?.trim() ? row.caughtName : resolved.displayName;
      const rarity = normalizeRarity(row.rarity);
      const key = `${name}::${rarity}`;
      const existing = byName.get(key) ?? { name, rarity, count: 0, totalValue: 0 };
      existing.count += 1;
      existing.totalValue += row.finalValue;
      byName.set(key, existing);
      baseTotal += row.finalValue;
      if (fisherBonusRate > 0) {
        fisherBonus += Math.floor(row.finalValue * fisherBonusRate);
      }
    }

    const entries = [...byName.values()].sort((a, b) => {
      if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    return {
      unsold: rows.length,
      baseTotal,
      fisherBonus,
      estimatedTotal: baseTotal + fisherBonus,
      entries
    };
  }

  public fishRarityGuideText(): string {
    const totalWeight = Object.values(FISH_RARITY_BASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    const catchLabelByRarity: Record<FishRarity, string> = {
      Trash: 'Trash Catch',
      Common: 'Common Catch',
      Rare: 'Rare Catch',
      Epic: 'Epic Catch',
      Legendary: 'Legendary Catch',
      Mythic: 'Mythic Catch',
      God: 'God Catch'
    };
    const lines: string[] = [];
    lines.push('Molgian Bureau - Fish Rarity Guide');
    lines.push('----------------------------------');
    lines.push('Base catch rates (Starter Rod, no boosts):');
    lines.push('');
    for (const rarity of FISH_RARITY_SORT_DESC) {
      const chance = (FISH_RARITY_BASE_WEIGHTS[rarity] / totalWeight) * 100;
      const chanceLabel = Number.isInteger(chance) ? `${chance.toFixed(0)}%` : `${chance.toFixed(1)}%`;
      lines.push(`${catchLabelByRarity[rarity]} (${chanceLabel})`);
      lines.push('');
    }
    lines.push('Note: rod bonuses, active pets, and events can change the final chance.');
    lines.push('God Catch can only happen from a rod rarity upgrade on an already-Mythic roll.');
    return lines.join('\n').trim();
  }

  public petRarityGuideText(): string {
    const formatPercent = (value: number): string =>
      Number.isInteger(value) ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;
    const renderRates = (label: string, rates: Array<{ rarity: Rarity; weight: number }>): string[] => {
      const total = rates.reduce((sum, rate) => sum + rate.weight, 0);
      const lines = [label];
      for (const rate of rates) {
        const chance = total > 0 ? (rate.weight / total) * 100 : 0;
        lines.push(`- ${rate.rarity}: ${formatPercent(chance)}`);
      }
      return lines;
    };

    return [
      'Molgian Bureau - Pet Rarity Guide',
      '---------------------------------',
      ...renderRates('Normal Egg:', HATCH_RATES_NORMAL),
      '',
      ...renderRates('Mythic Egg:', HATCH_RATES_MYTHIC_EGG),
      '',
      'Note: Egg Rate Boost events can improve final hatch outcomes.'
    ].join('\n');
  }

  public fishIndexBookText(): string {
    const discoveredRows = db
      .select({
        fishKey: fishCatches.fishKey,
        rarity: sql<string>`max(${fishCatches.rarity})`,
        count: sql<number>`count(*)`,
        bestValue: sql<number>`max(${fishCatches.finalValue})`,
        firstCaughtAt: sql<number>`min(${fishCatches.caughtAt})`
      })
      .from(fishCatches)
      .groupBy(fishCatches.fishKey)
      .all();

    if (discoveredRows.length === 0) {
      return [
        'Molgian Bureau Fish Index',
        '=========================',
        'No fish entries yet.',
        'Catch fish with /fish cast to start filling the index book.'
      ].join('\n');
    }

    const discovered = discoveredRows.map((row) => {
      const fish = resolveFishInfo(row.fishKey, row.rarity);
      const firstCatch = db
        .select({ userId: fishCatches.userId, caughtName: fishCatches.caughtName })
        .from(fishCatches)
        .where(eq(fishCatches.fishKey, row.fishKey))
        .orderBy(asc(fishCatches.caughtAt), asc(fishCatches.id))
        .limit(1)
        .get();
      const firstDiscoveredBy = firstCatch
        ? db.select().from(users).where(eq(users.id, firstCatch.userId)).get()?.username ?? `user-${firstCatch.userId}`
        : 'Unknown';
      return {
        fishKey: row.fishKey,
        displayName: firstCatch?.caughtName?.trim() ? firstCatch.caughtName : fish.displayName,
        rarity: fish.rarity,
        count: Number(row.count ?? 0),
        bestValue: Number(row.bestValue ?? 0),
        firstDiscoveredBy,
        firstCaughtAt: Number(row.firstCaughtAt ?? 0)
      };
    });

    const byRarity = new Map<FishRarity, typeof discovered>();
    for (const rarity of FISH_RARITY_SORT_DESC) {
      byRarity.set(rarity, []);
    }
    for (const fish of discovered) {
      byRarity.get(fish.rarity)?.push(fish);
    }
    for (const rarity of FISH_RARITY_SORT_DESC) {
      byRarity
        .get(rarity)
        ?.sort((a, b) => b.bestValue - a.bestValue || b.count - a.count || a.displayName.localeCompare(b.displayName));
    }

    const rarestEntries = [...discovered]
      .sort(
        (a, b) =>
          fishRarityRank[b.rarity] - fishRarityRank[a.rarity] ||
          b.bestValue - a.bestValue ||
          b.count - a.count ||
          a.displayName.localeCompare(b.displayName)
      )
      .slice(0, 6);

    const lines: string[] = [];
    lines.push('Molgian Bureau Fish Index');
    lines.push('=========================');
    lines.push(`Discovered species: ${discovered.length}`);
    lines.push('');
    lines.push('Rarest Highlights');
    lines.push('-----------------');
    for (const [index, fish] of rarestEntries.entries()) {
      lines.push(
        `${index + 1}. ${fish.displayName} [${fish.rarity}] - best ${fish.bestValue}, seen ${fish.count}x, first discovered by: ${fish.firstDiscoveredBy}`
      );
    }
    lines.push('');
    lines.push('Catalog Pages');
    lines.push('-------------');
    for (const rarity of FISH_RARITY_SORT_DESC) {
      const entries = byRarity.get(rarity) ?? [];
      if (entries.length === 0) continue;
      lines.push(`${rarity} Page`);
      for (const fish of entries) {
        lines.push(
          `- ${fish.displayName} | seen ${fish.count}x | best ${fish.bestValue} | first discovered by: ${fish.firstDiscoveredBy}`
        );
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  public wikiHomeUrl(): string {
    return normalizeFandomBaseUrl(appEnv.FANDOM_WIKI_BASE_URL);
  }

  public wikiPageUrl(title: string): string {
    const baseUrl = this.wikiHomeUrl();
    const slug = toFandomPageSlug(title);
    if (!slug) return baseUrl;
    return `${baseUrl}/wiki/${encodeURIComponent(slug)}`;
  }

  public wikiSearchUrl(query: string): string {
    const baseUrl = this.wikiHomeUrl();
    const trimmed = query.trim();
    if (!trimmed) return baseUrl;
    return `${baseUrl}/wiki/Special:Search?query=${encodeURIComponent(trimmed)}`;
  }

  private findWikiPageByTitleOrSlug(titleOrSlug: string): typeof wikiPages.$inferSelect | undefined {
    const slug = normalizeWikiSlug(titleOrSlug);
    if (!slug) return undefined;
    return db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  }

  public async wikiCreate(
    discordId: string,
    username: string,
    title: string,
    content: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const normalizedTitle = title.trim().slice(0, 80);
    const normalizedContent = content.trim().slice(0, 3500);
    const slug = normalizeWikiSlug(normalizedTitle);
    if (!slug || normalizedTitle.length < 2) {
      return { ok: false, message: 'Title is too short or invalid.' };
    }
    if (normalizedContent.length < 3) {
      return { ok: false, message: 'Content is too short.' };
    }
    const existing = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
    if (existing) {
      return { ok: false, message: `Wiki page already exists: ${existing.title}. Use /wiki edit.` };
    }
    db.insert(wikiPages)
      .values({
        slug,
        title: normalizedTitle,
        content: normalizedContent,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: nowMs(),
        updatedAt: nowMs()
      })
      .run();
    return { ok: true, message: `Created wiki page "${normalizedTitle}" (slug: ${slug}).` };
  }

  public async wikiEdit(
    discordId: string,
    username: string,
    title: string,
    content: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const page = this.findWikiPageByTitleOrSlug(title);
    if (!page) {
      return { ok: false, message: 'Wiki page not found. Use /wiki create first.' };
    }
    const normalizedContent = content.trim().slice(0, 3500);
    if (normalizedContent.length < 3) {
      return { ok: false, message: 'Content is too short.' };
    }
    db.update(wikiPages)
      .set({
        content: normalizedContent,
        updatedByUserId: user.id,
        updatedAt: nowMs()
      })
      .where(eq(wikiPages.id, page.id))
      .run();
    return { ok: true, message: `Updated wiki page "${page.title}".` };
  }

  public wikiView(
    titleOrSlug: string
  ): { ok: boolean; message: string; page?: { title: string; slug: string; content: string; updatedAt: number; updatedBy: string | null } } {
    const page = this.findWikiPageByTitleOrSlug(titleOrSlug);
    if (!page) {
      return { ok: false, message: `Wiki page not found for "${titleOrSlug}".` };
    }
    const updatedBy = page.updatedByUserId
      ? db.select().from(users).where(eq(users.id, page.updatedByUserId)).get()?.username ?? null
      : null;
    return {
      ok: true,
      message: 'ok',
      page: {
        title: page.title,
        slug: page.slug,
        content: page.content,
        updatedAt: page.updatedAt,
        updatedBy
      }
    };
  }

  public wikiList(): Array<{ title: string; slug: string; updatedAt: number }> {
    return db
      .select({
        title: wikiPages.title,
        slug: wikiPages.slug,
        updatedAt: wikiPages.updatedAt
      })
      .from(wikiPages)
      .orderBy(desc(wikiPages.updatedAt))
      .limit(25)
      .all();
  }

  public wikiSearch(query: string): Array<{
    title: string;
    slug: string;
    updatedAt: number;
    preview: string;
  }> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const pattern = `%${trimmed}%`;
    const rows = db
      .select({
        title: wikiPages.title,
        slug: wikiPages.slug,
        content: wikiPages.content,
        updatedAt: wikiPages.updatedAt
      })
      .from(wikiPages)
      .where(or(like(wikiPages.title, pattern), like(wikiPages.content, pattern)))
      .orderBy(desc(wikiPages.updatedAt))
      .limit(15)
      .all();
    return rows.map((row) => ({
      title: row.title,
      slug: row.slug,
      updatedAt: row.updatedAt,
      preview:
        row.content.replace(/\s+/g, ' ').trim().slice(0, 120) +
        (row.content.replace(/\s+/g, ' ').trim().length > 120 ? '...' : '')
    }));
  }

  public wikiDelete(titleOrSlug: string): { ok: boolean; message: string } {
    const page = this.findWikiPageByTitleOrSlug(titleOrSlug);
    if (!page) return { ok: false, message: 'Wiki page not found.' };
    db.delete(wikiPages).where(eq(wikiPages.id, page.id)).run();
    return { ok: true, message: `Deleted wiki page "${page.title}".` };
  }

  public async gambleCoinflip(
    discordId: string,
    username: string,
    amount: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'gambling');
    if (!debtLock.ok) return debtLock;
    if (amount < 50) return { ok: false, message: 'Minimum gamble amount is 50 Molgium.' };
    let postBetBalance = 0;
    try {
      postBetBalance = this.changeBalance(user.id, -amount);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Insufficient Molgium.' };
    }
    this.incrementMissionMetric(user.id, 'gamble_play', 1);
    const won = Math.random() < 0.5;
    if (!won) {
      const treasuryDrip = Math.floor(amount * TREASURY_DRIP_GAMBLE_LOSS_RATE);
      if (treasuryDrip > 0) {
        this.addTreasury(treasuryDrip);
      }
      return {
        ok: true,
        message:
          `Coinflip loss. Lost ${amount} Molgium. ` +
          `${treasuryDrip > 0 ? `Loss tax: ${Math.round(TREASURY_DRIP_GAMBLE_LOSS_RATE * 100)}% (+${treasuryDrip} Treasury). ` : ''}` +
          `New balance: ${postBetBalance} Molgium.`
      };
    }
    this.incrementMissionMetric(user.id, 'gamble_win', 1);
    const active = await this.getActivePet(user.id);
    const bonus = active?.petType === 'Gambler' ? Math.floor(amount * PET_GAMBLER_WIN_BONUS[active.rarity]) : 0;
    const finalBalance = this.changeBalance(user.id, amount * 2 + bonus);
    return {
      ok: true,
      message: `Coinflip WIN. Payout ${amount * 2}${bonus > 0 ? ` + ${bonus} bonus` : ''}. New balance: ${finalBalance} Molgium.`
    };
  }

  public async gambleDice(
    discordId: string,
    username: string,
    amount: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'gambling');
    if (!debtLock.ok) return debtLock;
    if (amount < 50) return { ok: false, message: 'Minimum gamble amount is 50 Molgium.' };
    let postBetBalance = 0;
    try {
      postBetBalance = this.changeBalance(user.id, -amount);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Insufficient Molgium.' };
    }
    this.incrementMissionMetric(user.id, 'gamble_play', 1);
    const player = randomIntInclusive(1, 6);
    const house = randomIntInclusive(1, 6);
    if (player <= house) {
      const treasuryDrip = Math.floor(amount * TREASURY_DRIP_GAMBLE_LOSS_RATE);
      if (treasuryDrip > 0) {
        this.addTreasury(treasuryDrip);
      }
      return {
        ok: true,
        message:
          `Dice loss (${player} vs ${house}). Lost ${amount}. ` +
          `${treasuryDrip > 0 ? `Loss tax: ${Math.round(TREASURY_DRIP_GAMBLE_LOSS_RATE * 100)}% (+${treasuryDrip} Treasury). ` : ''}` +
          `New balance: ${postBetBalance} Molgium.`
      };
    }
    this.incrementMissionMetric(user.id, 'gamble_win', 1);
    const active = await this.getActivePet(user.id);
    const bonus = active?.petType === 'Gambler' ? Math.floor(amount * PET_GAMBLER_WIN_BONUS[active.rarity]) : 0;
    const finalBalance = this.changeBalance(user.id, amount * 2 + bonus);
    return {
      ok: true,
      message: `Dice WIN (${player} vs ${house}). Payout ${amount * 2}${bonus > 0 ? ` + ${bonus} bonus` : ''}. New balance: ${finalBalance} Molgium.`
    };
  }

  private openJackpotRound(): typeof jackpotRounds.$inferSelect | undefined {
    return db.select().from(jackpotRounds).where(eq(jackpotRounds.status, 'open')).orderBy(desc(jackpotRounds.id)).get();
  }

  private ensureJackpotRound(): { ok: true; round: typeof jackpotRounds.$inferSelect } | { ok: false; message: string } {
    const open = this.openJackpotRound();
    if (open) return { ok: true, round: open };
    const latest = db
      .select()
      .from(jackpotRounds)
      .where(eq(jackpotRounds.status, 'closed'))
      .orderBy(desc(jackpotRounds.closedAt))
      .limit(1)
      .get();
    if (latest?.closedAt && nowMs() - latest.closedAt < JACKPOT_COOLDOWN_MS) {
      const wait = Math.ceil((JACKPOT_COOLDOWN_MS - (nowMs() - latest.closedAt)) / 1000);
      return { ok: false, message: `Next jackpot round in ${wait}s.` };
    }
    const round = db
      .insert(jackpotRounds)
      .values({ status: 'open', startedAt: nowMs(), closedAt: null, winnerUserId: null, totalPool: 0, taxCollected: 0 })
      .returning()
      .get();
    return { ok: true, round };
  }

  public async jackpotEnter(
    discordId: string,
    username: string,
    amount: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'entering jackpot');
    if (!debtLock.ok) return debtLock;
    if (amount <= 0) return { ok: false, message: 'Amount must be positive.' };
    const roundResult = this.ensureJackpotRound();
    if (!roundResult.ok) return roundResult;
    const round = roundResult.round;
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        if (wallet.amount < amount) throw new Error('Insufficient Molgium');
        tx.update(balances).set({ amount: wallet.amount - amount }).where(eq(balances.userId, user.id)).run();
        tx.insert(jackpotEntries).values({ roundId: round.id, userId: user.id, amount, enteredAt: nowMs() }).run();
        tx.update(jackpotRounds).set({ totalPool: round.totalPool + amount }).where(eq(jackpotRounds.id, round.id)).run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Jackpot entry failed.' };
    }
    return {
      ok: true,
      message: `Entered jackpot with ${amount} Molgium. Winner chance is proportional to total contribution.`
    };
  }

  public jackpotStatus(): {
    header: string;
    entries: Array<{ username: string; amount: number; winChancePct: number }>;
  } {
    const round = this.openJackpotRound();
    if (!round) return { header: 'No active jackpot round.', entries: [] };
    const grouped = db
      .select({
        userId: jackpotEntries.userId,
        amount: sql<number>`sum(${jackpotEntries.amount})`
      })
      .from(jackpotEntries)
      .where(eq(jackpotEntries.roundId, round.id))
      .groupBy(jackpotEntries.userId)
      .all();
    return {
      header: `Round #${round.id} pool ${round.totalPool} Molgium`,
      entries: grouped.map((entry) => {
        const user = db.select().from(users).where(eq(users.id, entry.userId)).get();
        const value = Number(entry.amount ?? 0);
        return {
          username: user?.username ?? `user-${entry.userId}`,
          amount: value,
          winChancePct: round.totalPool === 0 ? 0 : Number(((value / round.totalPool) * 100).toFixed(2))
        };
      })
    };
  }

  private async resolveJackpotIfReady(): Promise<void> {
    const round = this.openJackpotRound();
    if (!round) return;
    if (nowMs() - round.startedAt < JACKPOT_COOLDOWN_MS) return;
    const grouped = db
      .select({
        userId: jackpotEntries.userId,
        amount: sql<number>`sum(${jackpotEntries.amount})`
      })
      .from(jackpotEntries)
      .where(eq(jackpotEntries.roundId, round.id))
      .groupBy(jackpotEntries.userId)
      .all();
    if (grouped.length === 0) {
      db.update(jackpotRounds).set({ status: 'closed', closedAt: nowMs() }).where(eq(jackpotRounds.id, round.id)).run();
      return;
    }
    const weighted = grouped.map((entry) => ({
      userId: entry.userId,
      weight: Math.max(1, Number(entry.amount ?? 0))
    }));
    const winnerUserId = weightedPick(weighted.map((entry) => ({ item: entry.userId, weight: entry.weight })));
    const tax = calculateJackpotTax(round.totalPool);
    const payout = round.totalPool - tax;
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, winnerUserId)).get();
      const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!wallet || !treasuryRow) throw new Error('wallet/treasury missing');
      tx.update(balances).set({ amount: wallet.amount + payout }).where(eq(balances.userId, winnerUserId)).run();
      tx
        .update(treasury)
        .set({ amount: treasuryRow.amount + tax, updatedAt: nowMs() })
        .where(eq(treasury.id, 1))
        .run();
      tx
        .update(jackpotRounds)
        .set({
          status: 'closed',
          closedAt: nowMs(),
          winnerUserId,
          taxCollected: tax
        })
        .where(eq(jackpotRounds.id, round.id))
        .run();
    });
    const winner = db.select().from(users).where(eq(users.id, winnerUserId)).get();
    await this.sendEventMessage(
      `Jackpot #${round.id} resolved. Winner: ${winner?.username ?? 'Unknown'}, payout ${payout}, treasury tax ${tax}.`,
      'Jackpot'
    );
  }

  private majorEvents: EventName[] = [
    'tax_audit',
    'inflation_spike',
    'egg_rate_boost',
    'fishing_madness',
    'coinflip_chaos'
  ];

  private startSchedulers(): void {
    this.scheduleMajor();
    this.scheduleMicro();
    void this.applyWeeklyTreasuryTaxIfDue();
    this.eggInterval = setInterval(() => {
      void this.tickEggSpawner();
    }, 20_000);
    this.jackpotInterval = setInterval(() => {
      void this.resolveJackpotIfReady();
    }, 30_000);
    this.weeklyTaxInterval = setInterval(() => {
      void this.applyWeeklyTreasuryTaxIfDue();
    }, 60_000);
  }

  private scheduleMajor(): void {
    const delay = randomIntInclusive(MAJOR_EVENT_MIN_MS, MAJOR_EVENT_MAX_MS);
    this.majorTimer = setTimeout(async () => {
      try {
        await this.runMajorEvent();
      } catch (error) {
        logger.error('Major event failed', { error: String(error) });
      }
      this.scheduleMajor();
    }, delay);
  }

  private scheduleMicro(): void {
    const delay = randomIntInclusive(MICRO_EVENT_MIN_MS, MICRO_EVENT_MAX_MS);
    this.microTimer = setTimeout(async () => {
      try {
        await this.runMicroEvent();
      } catch (error) {
        logger.error('Micro event failed', { error: String(error) });
      }
      this.scheduleMicro();
    }, delay);
  }

  private majorEventsCountToday(): number {
    return this.getStateNumber(`major_events_count:${this.currentDayKey()}`) ?? 0;
  }

  private incrementMajorCountToday(): void {
    const key = `major_events_count:${this.currentDayKey()}`;
    const current = this.getStateNumber(key) ?? 0;
    this.setState(key, String(current + 1));
  }

  private recentActiveMembers(): GuildMember[] {
    if (!this.guild) return [];
    const threshold = nowMs() - 30 * 60_000;
    return [...this.activeUsers.entries()]
      .filter(([, seenAt]) => seenAt >= threshold)
      .map(([discordId]) => this.guild!.members.cache.get(discordId))
      .filter((member): member is GuildMember => !!member && !member.user.bot);
  }

  private eventEmbed(content: string, title = 'Special Place'): ReturnType<typeof createBotEmbed> {
    return createBotEmbed(content, { tone: 'event', title });
  }

  private eventPingMention(): Pick<MessageCreateOptions, 'content' | 'allowedMentions'> {
    const roleId = this.citizensRoleId ?? this.getState('citizens:role_id');
    if (!roleId) return {};
    return {
      content: `<@&${roleId}>`,
      allowedMentions: { roles: [roleId] }
    };
  }

  private async sendEventMessage(content: string, title = 'Special Place'): Promise<void> {
    if (!this.eventChannel) return;
    await this.eventChannel.send({ embeds: [this.eventEmbed(content, title)] });
  }

  private async sendEventPing(content: string, title = 'Special Place'): Promise<void> {
    if (!this.eventChannel) return;
    await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [this.eventEmbed(content, title)],
    });
  }

  private async runMajorEvent(): Promise<void> {
    if (this.majorEventsCountToday() >= MAJOR_EVENT_DAILY_CAP) return;
    const name = pickRandom(this.majorEvents);
    await this.runEvent(name);
    this.incrementMajorCountToday();
  }

  private async runMicroEvent(): Promise<void> {
    const name = selectMicroEvent(this.getTreasury());
    await this.runEvent(name);
  }

  private shouldThrottleEvent(name: EventName, bypassCooldown: boolean): boolean {
    if (bypassCooldown) return false;
    if (name === 'egg_spawn') return false;
    const lastEventAt = this.getStateNumber('events:last_started_at') ?? 0;
    return nowMs() - lastEventAt < EVENT_GLOBAL_COOLDOWN_MS;
  }

  public patchNotesText(): string {
    return [
      'Molgian Bureau - Patch Notes',
      '============================',
      '',
      '- Endgame (new):',
      '  - Added class system with paid starter unlock (2500 Molgium).',
      '  - Added /class quiz recommendation flow.',
      '  - Added branch-locked progression: Base -> T2 path -> locked T3 specialization.',
      '  - Added class reset (high cost) to reroll your path.',
      '',
      '- Gear and Forge (new):',
      '  - Added named gear inventory and slot equips.',
      '  - Added /shop categories for weapons, armor, materials, rods, and jobs.',
      '  - Added boss crafting recipes with hard-to-get materials.',
      '  - Added salvage flow for converting gear back into crafting materials.',
      '',
      '- Raids (new):',
      '  - Added co-op raid lobbies with join codes and party size limits.',
      '  - Raids now run as staged encounters (NPC waves -> elites -> boss).',
      '  - Added random mutators and anti-repeat encounter generation.',
      '  - Added four difficulties: Normal, Hard, Nightmare, Infernal.',
      '  - Added guaranteed Molgium payout on clear plus material and egg drop chances.',
      '  - Added Raid pets: higher raid loot chance and extra Molgium on raid wins.',
      '  - Raid starts now charge entry fees; failures apply extra wipe penalty.',
      '  - Raid penalties can create debt (floor -10000), with soft lock on risky commands.',
      '  - Raid fee sink split: 50% Treasury, 50% burned.',
      '',
      '- Economy:',
      '  - Base salary is now 150 Molgium.',
      '  - Job costs are 10000 / 20000 / 50000.',
      '  - Job salary bases are 500 / 1000 / 2000.',
      '  - Gamble minimum bet is 50 Molgium.',
      '  - Work streak bonus added: +3% per day (cap +30%).',
      '',
      '- Fishing and Hall of Fame:',
      '  - Added God fish tier from rod-only Mythic bump.',
      '  - Rod cooldowns: Starter 15m, Improved 10m, Elite 5m, GOD Rod 2m.',
      '  - Added GOD Rod (150000 Molgium) with top-tier fishing bonuses.',
      '  - Hall of Fame now tracks Mythic pet hatches + Mythic/God fish catches.',
      '',
      '- Events and Treasury:',
      '  - Added global anti-spam cooldown between non-egg events.',
      '  - Sell tax is now 20% and gamble loss tax is now 25% (to Treasury).',
      '  - Weekly Treasury tax applies 20% wallet tax server-wide.',
      '',
      '- Missions:',
      '  - Added daily and weekly missions.',
      '  - Mission rewards are random 0.1 to 0.5 shards + Molgium.',
      '  - New commands: /missions view and /missions claim.',
      '',
      '- Profiles:',
      '  - /profile now shows class path, raid power, and active set bonuses.',
      '',
      '- Reliability:',
      '  - Bot now auto-recreates missing core rows for existing users.',
      '  - Added SQLite backup flow and safer production DB handling.',
      '',
      'Tip: use /patchnotes anytime to view this summary.'
    ].join('\n');
  }

  public async runEvent(name: EventName, options?: { bypassCooldown?: boolean }): Promise<void> {
    if (this.shouldThrottleEvent(name, options?.bypassCooldown ?? false)) {
      logger.info('Event throttled', { event: name });
      return;
    }
    this.setState('events:last_started_at', String(nowMs()));
    const run = db
      .insert(eventRuns)
      .values({
        eventType: name,
        status: 'running',
        startedAt: nowMs(),
        endedAt: null,
        winnerUserId: null,
        detailsJson: null
      })
      .returning()
      .get();
    try {
      if (name === 'pickpocket') await this.eventPickpocket(run.id);
      if (name === 'claim_rush') await this.eventClaimRush(run.id);
      if (name === 'stimulus_drop') await this.eventStimulusDrop(run.id);
      if (name === 'tax_audit') await this.eventTaxAudit(run.id);
      if (name === 'inflation_spike') await this.eventTimedBoost(run.id, 'event:inflation_until', 10 * 60_000, 'Inflation Spike: /work payout x2 for 10 minutes.');
      if (name === 'egg_rate_boost') await this.eventTimedBoost(run.id, 'event:egg_boost_until', 30 * 60_000, 'Egg Rate Boost: improved hatch odds for 30 minutes.');
      if (name === 'fishing_madness') await this.eventTimedBoost(run.id, 'event:fishing_madness_until', 10 * 60_000, 'Fishing Madness: Trash removed for 10 minutes.');
      if (name === 'coinflip_chaos') await this.eventCoinflipChaos(run.id);
      if (name === 'egg_spawn') await this.spawnEggEvent(true);
      db.update(eventRuns).set({ status: 'completed', endedAt: nowMs() }).where(eq(eventRuns.id, run.id)).run();
    } catch (error) {
      db.update(eventRuns)
        .set({ status: 'failed', endedAt: nowMs(), detailsJson: JSON.stringify({ error: String(error) }) })
        .where(eq(eventRuns.id, run.id))
        .run();
      throw error;
    }
  }

  private async eventTimedBoost(runId: number, key: string, duration: number, announcement: string): Promise<void> {
    void runId;
    this.setState(key, String(nowMs() + duration));
    await this.sendEventPing(announcement);
  }

  private async eventPickpocket(runId: number): Promise<void> {
    const members = this.recentActiveMembers();
    if (members.length < 2) {
      await this.sendEventPing('Pickpocket fizzled: not enough active users.');
      return;
    }
    const thief = pickRandom(members);
    const victim = pickRandom(members.filter((member) => member.id !== thief.id));
    const thiefUser = await this.getUser(thief.id, thief.user.username);
    const victimUser = await this.getUser(victim.id, victim.user.username);
    const victimWallet = db.select().from(balances).where(eq(balances.userId, victimUser.id)).get();
    if (!victimWallet || victimWallet.amount <= 0) {
      await this.sendEventPing('Pickpocket failed: victim had no Molgium.');
      return;
    }
    const stolen = Math.min(victimWallet.amount, randomIntInclusive(100, 300));
    db.transaction((tx) => {
      const thiefWallet = tx.select().from(balances).where(eq(balances.userId, thiefUser.id)).get();
      const victimCurrent = tx.select().from(balances).where(eq(balances.userId, victimUser.id)).get();
      if (!thiefWallet || !victimCurrent) throw new Error('wallet missing');
      tx
        .update(balances)
        .set({ amount: thiefWallet.amount + stolen })
        .where(eq(balances.userId, thiefUser.id))
        .run();
      tx
        .update(balances)
        .set({ amount: victimCurrent.amount - stolen })
        .where(eq(balances.userId, victimUser.id))
        .run();
    });
    db.update(eventRuns)
      .set({
        winnerUserId: thiefUser.id,
        detailsJson: JSON.stringify({ thief: thief.user.username, victim: victim.user.username, stolen })
      })
      .where(eq(eventRuns.id, runId))
      .run();
    await this.sendEventPing(`Pickpocket: ${thief.user.username} stole ${stolen} from ${victim.user.username}.`);
  }

  private async eventClaimRush(runId: number): Promise<void> {
    if (!this.eventChannel) return;
    const word = pickRandom(claimWords);
    await this.sendEventPing(`Claim Rush: first to type **${word}** wins Treasury payout.`);
    const winnerDiscordId = await new Promise<string | null>((resolve) => {
      const collector = this.eventChannel!.createMessageCollector({
        time: EGG_EVENT_WINDOW_MS,
        filter: (message) => !message.author.bot && message.content.trim().toUpperCase() === word
      });
      let finished = false;
      collector.on('collect', (message) => {
        if (finished) return;
        finished = true;
        resolve(message.author.id);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!finished) resolve(null);
      });
    });
    if (!winnerDiscordId) {
      await this.sendEventMessage('Claim Rush expired with no winner.', 'Claim Rush');
      return;
    }
    const user = await this.getUser(winnerDiscordId);
    const payout = this.takeTreasury(250);
    if (payout <= 0) {
      await this.sendEventMessage('Claim Rush winner found, but Treasury was empty.', 'Claim Rush');
      return;
    }
    this.changeBalance(user.id, payout);
    db.update(eventRuns).set({ winnerUserId: user.id, detailsJson: JSON.stringify({ payout }) }).where(eq(eventRuns.id, runId)).run();
    await this.sendEventMessage(`<@${winnerDiscordId}> won Claim Rush and got ${payout} Molgium.`, 'Claim Rush');
  }

  private async eventStimulusDrop(runId: number): Promise<void> {
    const members = this.recentActiveMembers();
    if (members.length === 0) {
      await this.sendEventPing('Stimulus Drop skipped: no active users.');
      return;
    }
    const winnerMember = pickRandom(members);
    const payout = this.takeTreasury(randomIntInclusive(120, 300));
    if (payout <= 0) {
      await this.sendEventPing('Stimulus Drop skipped: Treasury empty.');
      return;
    }
    const user = await this.getUser(winnerMember.id, winnerMember.user.username);
    this.changeBalance(user.id, payout);
    db.update(eventRuns).set({ winnerUserId: user.id, detailsJson: JSON.stringify({ payout }) }).where(eq(eventRuns.id, runId)).run();
    await this.sendEventPing(`Stimulus Drop: ${winnerMember.user.username} received ${payout} Molgium.`);
  }

  private async eventTaxAudit(runId: number): Promise<void> {
    void runId;
    const wallets = db.select().from(balances).all();
    let collected = 0;
    db.transaction((tx) => {
      for (const wallet of wallets) {
        if (wallet.amount <= 0) continue;
        const tax = Math.max(1, Math.floor(wallet.amount * 0.04));
        tx.update(balances).set({ amount: wallet.amount - tax }).where(eq(balances.userId, wallet.userId)).run();
        collected += tax;
      }
      const treasuryRow = tx.select().from(treasury).where(eq(treasury.id, 1)).get();
      if (!treasuryRow) throw new Error('treasury missing');
      tx.update(treasury).set({ amount: treasuryRow.amount + collected, updatedAt: nowMs() }).where(eq(treasury.id, 1)).run();
    });
    await this.sendEventPing(`Tax Audit: collected ${collected} Molgium into Treasury.`);
  }

  private async eventCoinflipChaos(runId: number): Promise<void> {
    void runId;
    const wallets = db.select().from(balances).where(gte(balances.amount, 100)).all();
    let wins = 0;
    let losses = 0;
    db.transaction((tx) => {
      for (const wallet of wallets) {
        if (Math.random() < 0.5) {
          wins += 1;
          tx.update(balances).set({ amount: wallet.amount + 100 }).where(eq(balances.userId, wallet.userId)).run();
        } else {
          losses += 1;
          tx.update(balances).set({ amount: wallet.amount - 100 }).where(eq(balances.userId, wallet.userId)).run();
        }
      }
    });
    await this.sendEventPing(`Coinflip Chaos: wins ${wins}, losses ${losses}, participants ${wallets.length}.`);
  }

  private eggWinsToday(): number {
    const start = this.currentWindowStart();
    const end = start + 24 * 60 * 60 * 1000;
    return Number(
      db
        .select({ count: sql<number>`count(*)` })
        .from(eventRuns)
        .where(
          and(
            like(eventRuns.eventType, 'egg_%'),
            eq(eventRuns.status, 'completed'),
            gte(eventRuns.startedAt, start),
            sql`${eventRuns.startedAt} < ${end}`,
            sql`${eventRuns.winnerUserId} is not null`
          )
        )
        .get()?.count ?? 0
    );
  }

  private scheduleNextEgg(success: boolean): void {
    if (success) {
      this.setState('egg:next_spawn_at', String(nowMs() + randomIntInclusive(60 * 60_000, 2 * 60 * 60_000)));
      return;
    }
    this.setState('egg:next_spawn_at', String(nowMs() + randomIntInclusive(EGG_RESCHEDULE_MIN_MS, EGG_RESCHEDULE_MAX_MS)));
  }

  private async tickEggSpawner(): Promise<void> {
    if (!this.eventChannel || this.activeEggState) return;
    if (this.eggWinsToday() >= DAILY_EGG_TARGET) return;
    const nextSpawn = this.getStateNumber('egg:next_spawn_at') ?? 0;
    if (nowMs() < nextSpawn) return;
    await this.spawnEggEvent(false);
  }

  private createEggRun(type: EggGameType): number {
    const run = db
      .insert(eventRuns)
      .values({
        eventType: `egg_${type}`,
        status: 'running',
        startedAt: nowMs(),
        endedAt: null,
        winnerUserId: null,
        detailsJson: null
      })
      .returning()
      .get();
    return run.id;
  }

  private finishEggRun(runId: number, winnerUserId: number | null, details: Record<string, unknown>): void {
    db.update(eventRuns)
      .set({
        status: 'completed',
        endedAt: nowMs(),
        winnerUserId,
        detailsJson: JSON.stringify(details)
      })
      .where(eq(eventRuns.id, runId))
      .run();
  }

  private async awardEggWinner(discordId: string, username: string, runId: number): Promise<void> {
    const user = await this.ensureUser(discordId, username);
    db.transaction((tx) => {
      const eggRow = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
      if (!eggRow) throw new Error('Egg row missing');
      tx.update(eggsInventory)
        .set({ eggs: eggRow.eggs + 1, lastWinAt: nowMs() })
        .where(eq(eggsInventory.userId, user.id))
        .run();
    });
    let eventBonus = 0;
    const active = await this.getActivePet(user.id);
    if (active?.petType === 'Event') {
      eventBonus = PET_EVENT_BONUS[active.rarity];
      this.changeBalance(user.id, eventBonus);
    }
    this.finishEggRun(runId, user.id, { winnerDiscordId: discordId, eventBonus });
    this.scheduleNextEgg(true);
    await this.sendEventMessage(
      `<@${discordId}> won the Egg event and received 1 egg${eventBonus ? ` + ${eventBonus} Molgium` : ''}.`,
      'Egg Event'
    );
  }

  private async spawnEggEvent(forced: boolean): Promise<void> {
    if (!this.eventChannel || this.activeEggState) return;
    const type = pickRandom<EggGameType>(['speed_type', 'reaction_lock', 'emoji_memory', 'rapid_choice', 'quick_duel']);
    const runId = this.createEggRun(type);
    this.activeEggState = { runId, type };
    try {
      if (type === 'speed_type') await this.eggSpeedType(runId, forced);
      if (type === 'reaction_lock') await this.eggReactionLock(runId, forced);
      if (type === 'emoji_memory') await this.eggEmojiMemory(runId, forced);
      if (type === 'rapid_choice') await this.eggRapidChoice(runId, forced);
      if (type === 'quick_duel') await this.eggQuickDuel(runId, forced);
    } finally {
      this.activeEggState = null;
    }
  }

  private async eggSpeedType(runId: number, forced: boolean): Promise<void> {
    if (!this.eventChannel) return;
    const phrase = pickRandom(speedTypePrompts);
    await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [
        this.eventEmbed(`Egg Event [Speed Type]: type exactly:\n\`${phrase}\`${forced ? ' (forced)' : ''}`, 'Egg Event')
      ],
    });
    const winner = await new Promise<Message | null>((resolve) => {
      const collector = this.eventChannel!.createMessageCollector({
        time: EGG_EVENT_WINDOW_MS,
        filter: (message) => !message.author.bot && message.content.trim() === phrase
      });
      let resolved = false;
      collector.on('collect', async (message) => {
        if (resolved) return;
        resolved = true;
        resolve(message);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!resolved) resolve(null);
      });
    });
    if (!winner) {
      this.finishEggRun(runId, null, { expired: true });
      this.scheduleNextEgg(false);
      await this.sendEventMessage('Egg event expired. Rescheduling in 30-90 minutes.', 'Egg Event');
      return;
    }
    await this.awardEggWinner(winner.author.id, winner.author.username, runId);
  }

  private async eggReactionLock(runId: number, forced: boolean): Promise<void> {
    if (!this.eventChannel) return;
    const options = shuffle(['alpha', 'beta', 'gamma']);
    const correct = options[0]!;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      options.map((option) =>
        new ButtonBuilder().setCustomId(`egg_lock_${option}`).setLabel(option).setStyle(ButtonStyle.Primary)
      )
    );
    const message = await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [
        this.eventEmbed(
          `Egg Event [Reaction Lock]: press the correct lock within 2 minutes.${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      components: [row]
    });
    const winnerDiscordId = await new Promise<string | null>((resolve) => {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: EGG_EVENT_WINDOW_MS
      });
      let finished = false;
      collector.on('collect', async (interaction) => {
        if (finished) return;
        if (interaction.customId !== `egg_lock_${correct}`) {
          await interaction.reply({
            embeds: [createBotEmbed('Wrong lock.', { tone: 'warning', title: 'Egg Event' })],
            ephemeral: true
          });
          return;
        }
        finished = true;
        await interaction.reply({
          embeds: [createBotEmbed('Correct lock.', { tone: 'success', title: 'Egg Event' })],
          ephemeral: true
        });
        resolve(interaction.user.id);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!finished) resolve(null);
      });
    });
    await message.edit({ components: [] });
    if (!winnerDiscordId) {
      this.finishEggRun(runId, null, { expired: true });
      this.scheduleNextEgg(false);
      await this.sendEventMessage('Egg event expired. Rescheduling in 30-90 minutes.', 'Egg Event');
      return;
    }
    const winner = await this.getUser(winnerDiscordId);
    await this.awardEggWinner(winnerDiscordId, winner.username, runId);
  }

  private async eggEmojiMemory(runId: number, forced: boolean): Promise<void> {
    if (!this.eventChannel) return;
    const sequence = shuffle(emojiPool).slice(0, 4);
    const position = randomIntInclusive(1, 4);
    const answer = sequence[position - 1]!;
    const message = await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [
        this.eventEmbed(
          `Egg Event [Emoji Memory]: memorize for 5 seconds\n${sequence.join(' ')}${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
    });
    await sleep(5_000);
    await message.edit({
      embeds: [this.eventEmbed(`Egg Event [Emoji Memory]: which emoji was in position ${position}?`, 'Egg Event')]
    });
    const winner = await new Promise<Message | null>((resolve) => {
      const collector = this.eventChannel!.createMessageCollector({
        time: EGG_EVENT_WINDOW_MS,
        filter: (msg) => !msg.author.bot && msg.content.trim() === answer
      });
      let found = false;
      collector.on('collect', async (msg) => {
        if (found) return;
        found = true;
        resolve(msg);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!found) resolve(null);
      });
    });
    if (!winner) {
      this.finishEggRun(runId, null, { expired: true });
      this.scheduleNextEgg(false);
      await this.sendEventMessage('Egg event expired. Rescheduling in 30-90 minutes.', 'Egg Event');
      return;
    }
    await this.awardEggWinner(winner.author.id, winner.author.username, runId);
  }

  private async eggRapidChoice(runId: number, forced: boolean): Promise<void> {
    if (!this.eventChannel) return;
    const correct = pickRandom(['A', 'B', 'C']);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ['A', 'B', 'C'].map((choice) =>
        new ButtonBuilder().setCustomId(`egg_choice_${choice}`).setLabel(choice).setStyle(ButtonStyle.Secondary)
      )
    );
    const message = await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [
        this.eventEmbed(
          `Egg Event [Rapid Choice]: press the correct button in 2 minutes.${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      components: [row]
    });
    const winnerDiscordId = await new Promise<string | null>((resolve) => {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: EGG_EVENT_WINDOW_MS
      });
      let completed = false;
      collector.on('collect', async (interaction) => {
        if (completed) return;
        const pick = interaction.customId.replace('egg_choice_', '');
        if (pick !== correct) {
          await interaction.reply({
            embeds: [createBotEmbed('Wrong choice.', { tone: 'warning', title: 'Egg Event' })],
            ephemeral: true
          });
          return;
        }
        completed = true;
        await interaction.reply({
          embeds: [createBotEmbed('Correct.', { tone: 'success', title: 'Egg Event' })],
          ephemeral: true
        });
        resolve(interaction.user.id);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!completed) resolve(null);
      });
    });
    await message.edit({ components: [] });
    if (!winnerDiscordId) {
      this.finishEggRun(runId, null, { expired: true });
      this.scheduleNextEgg(false);
      await this.sendEventMessage('Egg event expired. Rescheduling in 30-90 minutes.', 'Egg Event');
      return;
    }
    const winner = await this.getUser(winnerDiscordId);
    await this.awardEggWinner(winnerDiscordId, winner.username, runId);
  }

  private async eggQuickDuel(runId: number, forced: boolean): Promise<void> {
    if (!this.eventChannel || !this.guild) return;
    const active = this.recentActiveMembers();
    let pool = active.length >= 2 ? active : this.guild.members.cache.filter((m) => !m.user.bot).map((m) => m);
    if (pool.length < 2) {
      try {
        await this.guild.members.fetch();
      } catch (error) {
        logger.warn('Quick Duel member fetch failed', { error: String(error) });
      }
      pool = this.guild.members.cache.filter((m) => !m.user.bot).map((m) => m);
    }
    if (pool.length < 2) {
      this.finishEggRun(runId, null, { expired: true, reason: 'insufficient_users' });
      this.scheduleNextEgg(false);
      await this.sendEventPing('Quick Duel canceled: not enough users in bot cache.');
      return;
    }
    const duelists = shuffle(pool).slice(0, 2);
    const duelistsSet = new Set(duelists.map((member) => member.id));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('egg_duel').setLabel('DUEL').setStyle(ButtonStyle.Danger)
    );
    const message = await this.eventChannel.send({
      ...this.eventPingMention(),
      embeds: [
        this.eventEmbed(
          `Egg Event [Quick Duel]: ${duelists.map((m) => `<@${m.id}>`).join(' vs ')}${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      components: [row]
    });
    const winnerDiscordId = await new Promise<string | null>((resolve) => {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: EGG_EVENT_WINDOW_MS
      });
      let done = false;
      collector.on('collect', async (interaction) => {
        if (done) return;
        if (!duelistsSet.has(interaction.user.id)) {
          await interaction.reply({
            embeds: [createBotEmbed('Not your duel.', { tone: 'warning', title: 'Egg Event' })],
            ephemeral: true
          });
          return;
        }
        done = true;
        await interaction.reply({
          embeds: [createBotEmbed('Duel won.', { tone: 'success', title: 'Egg Event' })],
          ephemeral: true
        });
        resolve(interaction.user.id);
        collector.stop('winner');
      });
      collector.on('end', () => {
        if (!done) resolve(null);
      });
    });
    await message.edit({ components: [] });
    if (!winnerDiscordId) {
      this.finishEggRun(runId, null, { expired: true });
      this.scheduleNextEgg(false);
      await this.sendEventMessage('Egg event expired. Rescheduling in 30-90 minutes.', 'Egg Event');
      return;
    }
    const winner = await this.getUser(winnerDiscordId);
    await this.awardEggWinner(winnerDiscordId, winner.username, runId);
  }

  private rollHatchRarityWithBoost(isMythicEgg: boolean): Rarity {
    const rolled = rollHatchRarity(isMythicEgg);
    if (!this.isBoostActive('event:egg_boost_until')) return rolled;
    if (rolled !== 'Common') return rolled;
    const reroll = rollHatchRarity(isMythicEgg);
    return rarityRank[reroll] > rarityRank[rolled] ? reroll : rolled;
  }

  private async announceRareFish(
    user: typeof users.$inferSelect,
    catchId: number,
    fishKey: string,
    fishName: string,
    rarity: FishRarity,
    value: number,
    upgradedToGodByRod: boolean
  ): Promise<void> {
    const hof = await this.ensureHofChannel();
    const tierText = rarity === 'God' ? 'GOD FISH' : 'MYTHIC FISH';
    const rodNote = upgradedToGodByRod ? ' (rod tier upgrade proc)' : '';
    const message = `${tierText}: ${user.username} caught ${fishName} [${rarity}] worth ${value} Molgium (catch #${catchId})${rodNote}.`;

    if (this.eventChannel) {
      await this.eventChannel.send({
        embeds: [createBotEmbed(message, { tone: 'event', title: 'Rare Fish' })]
      });
    }
    if (hof) {
      await hof.send({
        embeds: [createBotEmbed(message, { tone: 'event', title: 'Hall of Fame' })]
      });
      db.insert(fishHallOfFame)
        .values({
          userId: user.id,
          catchId,
          fishKey,
          fishName,
          rarity,
          channelId: hof.id,
          recordedAt: nowMs()
        })
        .run();
    }
  }

  private async announceMythic(user: typeof users.$inferSelect, petType: PetType, petInstanceId: number): Promise<void> {
    const hof = await this.ensureHofChannel();
    const message = `MYTHIC HATCH: ${user.username} hatched a Mythic ${petType} pet (instance #${petInstanceId}).`;
    if (this.eventChannel) {
      await this.eventChannel.send({
        embeds: [createBotEmbed(message, { tone: 'event', title: 'Mythic Hatch' })]
      });
    }
    if (hof) {
      await hof.send({
        embeds: [createBotEmbed(message, { tone: 'event', title: 'Hall of Fame' })]
      });
    }
    if (hof) {
      db.insert(mythicHallOfFame)
        .values({
          userId: user.id,
          petInstanceId,
          petType,
          rarity: 'Mythic',
          channelId: hof.id,
          hatchedAt: nowMs()
        })
        .run();
    }
  }

  public async hatch(
    discordId: string,
    username: string,
    eggType: 'normal' | 'mythic'
  ): Promise<{ ok: boolean; suspense: string[]; final: string }> {
    const user = await this.ensureUser(discordId, username);
    const inventory = db.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
    if (!inventory) return { ok: false, suspense: [], final: 'Egg inventory missing.' };
    if (eggType === 'normal' && inventory.eggs <= 0) return { ok: false, suspense: [], final: 'No normal eggs available.' };
    if (eggType === 'mythic' && inventory.mythicEggs <= 0) return { ok: false, suspense: [], final: 'No mythic eggs available.' };

    const rarity = this.rollHatchRarityWithBoost(eggType === 'mythic');
    const petType = pickRandom(PET_TYPES);
    const generatedName = generateCreatureName();
    const petTypeLabel = `${petType.toLowerCase()} type`;
    let duplicate = false;
    let petInstanceId = 0;
    db.transaction((tx) => {
      const userLatest = tx.select().from(users).where(eq(users.id, user.id)).get();
      const eggs = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
      if (!userLatest || !eggs) throw new Error('User or eggs missing');
      if (eggType === 'normal' && eggs.eggs <= 0) throw new Error('No normal eggs left');
      if (eggType === 'mythic' && eggs.mythicEggs <= 0) throw new Error('No mythic eggs left');
      tx.update(eggsInventory)
        .set({
          eggs: eggType === 'normal' ? eggs.eggs - 1 : eggs.eggs,
          mythicEggs: eggType === 'mythic' ? eggs.mythicEggs - 1 : eggs.mythicEggs
        })
        .where(eq(eggsInventory.userId, user.id))
        .run();
      tx.update(users)
        .set({ lifetimeEggsHatched: userLatest.lifetimeEggsHatched + 1, updatedAt: nowMs() })
        .where(eq(users.id, user.id))
        .run();
      const owned = tx
        .select()
        .from(petsOwned)
        .where(and(eq(petsOwned.userId, user.id), eq(petsOwned.petType, petType), eq(petsOwned.rarity, rarity)))
        .get();
      duplicate = Boolean(owned);
      const instance = tx
        .insert(petInstances)
        .values({
          userId: user.id,
          petType,
          rarity,
          generatedName,
          generatedTypeLabel: petTypeLabel,
          sourceEggType: eggType,
          status: duplicate ? 'pending' : 'kept',
          createdAt: nowMs(),
          resolvedAt: duplicate ? null : nowMs()
        })
        .returning()
        .get();
      petInstanceId = instance.id;
      if (!duplicate) {
        if (owned) {
          tx.update(petsOwned).set({ count: owned.count + 1 }).where(eq(petsOwned.id, owned.id)).run();
        } else {
          tx.insert(petsOwned).values({ userId: user.id, petType, rarity, count: 1, firstOwnedAt: nowMs() }).run();
        }
        const active = tx.select().from(activePet).where(eq(activePet.userId, user.id)).get();
        if (!active?.petInstanceId) {
          tx.update(activePet).set({ petInstanceId, equippedAt: nowMs() }).where(eq(activePet.userId, user.id)).run();
        }
      }
    });
    if (rarity === 'Mythic' && !duplicate) {
      await this.announceMythic(user, petType, petInstanceId);
    }
    this.incrementMissionMetric(user.id, 'hatch', 1);
    return {
      ok: true,
      suspense: ['Common...', 'Rare...', 'Epic...', 'Legendary...', 'Final result...'],
      final:
        `Hatched ${generatedName} - ${rarity} ${petType} pet (instance #${petInstanceId}). ` +
        (duplicate ? `Duplicate detected. Resolve with /pet keep|shard|sell.` : 'Added to owned collection.')
    };
  }

  public async petsList(discordId: string, username: string): Promise<{
    activePetId: number | null;
    pets: Array<{
      id: number;
      petType: string;
      rarity: string;
      generatedName: string;
      generatedTypeLabel: string;
      status: string;
      createdAt: number;
    }>;
  }> {
    const user = await this.ensureUser(discordId, username);
    const active = db.select().from(activePet).where(eq(activePet.userId, user.id)).get();
    const pets = db
      .select({
        id: petInstances.id,
        petType: petInstances.petType,
        rarity: petInstances.rarity,
        generatedName: petInstances.generatedName,
        generatedTypeLabel: petInstances.generatedTypeLabel,
        status: petInstances.status,
        createdAt: petInstances.createdAt
      })
      .from(petInstances)
      .where(eq(petInstances.userId, user.id))
      .orderBy(desc(petInstances.createdAt))
      .limit(20)
      .all()
      .map((pet) => {
        const flavor = this.ensurePetFlavor(pet);
        return {
          ...pet,
          generatedName: flavor.generatedName,
          generatedTypeLabel: flavor.generatedTypeLabel
        };
      });
    return { activePetId: active?.petInstanceId ?? null, pets };
  }

  public async petEquip(discordId: string, username: string, petInstanceId: number): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const pet = db
      .select()
      .from(petInstances)
      .where(and(eq(petInstances.id, petInstanceId), eq(petInstances.userId, user.id), eq(petInstances.status, 'kept')))
      .get();
    if (!pet) return { ok: false, message: 'Pet instance not found or not kept.' };
    const flavor = this.ensurePetFlavor(pet);
    db.update(activePet).set({ petInstanceId, equippedAt: nowMs() }).where(eq(activePet.userId, user.id)).run();
    return {
      ok: true,
      message: `Equipped ${flavor.generatedName} - ${pet.rarity} ${pet.petType} (#${pet.id}).`
    };
  }

  public async petResolve(
    discordId: string,
    username: string,
    petInstanceId: number,
    action: 'keep' | 'shard' | 'sell'
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    if (action === 'keep') {
      const pet = db
        .select()
        .from(petInstances)
        .where(and(eq(petInstances.id, petInstanceId), eq(petInstances.userId, user.id), eq(petInstances.status, 'pending')))
        .get();
      if (!pet) return { ok: false, message: 'Pending duplicate pet not found.' };
      const rarity = pet.rarity as Rarity;
      db.transaction((tx) => {
        tx.update(petInstances).set({ status: 'kept', resolvedAt: nowMs() }).where(eq(petInstances.id, pet.id)).run();
        const owned = tx
          .select()
          .from(petsOwned)
          .where(and(eq(petsOwned.userId, user.id), eq(petsOwned.petType, pet.petType), eq(petsOwned.rarity, rarity)))
          .get();
        if (owned) {
          tx.update(petsOwned).set({ count: owned.count + 1 }).where(eq(petsOwned.id, owned.id)).run();
        } else {
          tx.insert(petsOwned).values({ userId: user.id, petType: pet.petType, rarity, count: 1, firstOwnedAt: nowMs() }).run();
        }
      });
      return { ok: true, message: `Pet #${pet.id} kept.` };
    }
    if (action === 'shard') {
      const pet = db
        .select()
        .from(petInstances)
        .where(and(eq(petInstances.id, petInstanceId), eq(petInstances.userId, user.id), eq(petInstances.status, 'pending')))
        .get();
      if (!pet) return { ok: false, message: 'Pending duplicate pet not found.' };
      const rarity = pet.rarity as Rarity;
      const gain = SHARD_VALUES[rarity];
      const beforeAmount = this.getShardDisplayAmount(user.id);
      db.transaction((tx) => {
        tx.update(petInstances).set({ status: 'sharded', resolvedAt: nowMs() }).where(eq(petInstances.id, pet.id)).run();
      });
      const gainTenths = rarity === 'Common' ? 5 : gain * 10;
      this.addShardsTenths(user.id, gainTenths);
      const afterAmount = this.getShardDisplayAmount(user.id);
      return {
        ok: true,
        message:
          `Pet #${pet.id} sharded for ${this.formatShardAmount(gainTenths / 10)} shards. ` +
          `Shards: ${this.formatShardAmount(beforeAmount)} -> ${this.formatShardAmount(afterAmount)}.`
      };
    }

    const pet = db
      .select()
      .from(petInstances)
      .where(
        and(
          eq(petInstances.id, petInstanceId),
          eq(petInstances.userId, user.id),
          or(eq(petInstances.status, 'pending'), eq(petInstances.status, 'kept'))
        )
      )
      .get();
    if (!pet) return { ok: false, message: 'Pet instance not found or already resolved.' };
    const rarity = pet.rarity as Rarity;
    const value = SELL_VALUES[rarity];
    let replacedActiveWithId: number | null = null;
    let soldActive = false;
    let finalBalance = 0;
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
      if (!wallet) throw new Error('wallet missing');
      if (pet.status === 'kept') {
        const owned = tx
          .select()
          .from(petsOwned)
          .where(and(eq(petsOwned.userId, user.id), eq(petsOwned.petType, pet.petType), eq(petsOwned.rarity, rarity)))
          .get();
        if (!owned || owned.count <= 0) throw new Error('Owned pet count is invalid.');
        if (owned.count === 1) {
          tx.delete(petsOwned).where(eq(petsOwned.id, owned.id)).run();
        } else {
          tx.update(petsOwned).set({ count: owned.count - 1 }).where(eq(petsOwned.id, owned.id)).run();
        }
        const active = tx.select().from(activePet).where(eq(activePet.userId, user.id)).get();
        if (active?.petInstanceId === pet.id) {
          const fallback = tx
            .select({ id: petInstances.id })
            .from(petInstances)
            .where(
              and(
                eq(petInstances.userId, user.id),
                eq(petInstances.status, 'kept'),
                sql`${petInstances.id} <> ${pet.id}`
              )
            )
            .orderBy(desc(petInstances.createdAt))
            .get();
          replacedActiveWithId = fallback?.id ?? null;
          soldActive = true;
          tx.update(activePet)
            .set({
              petInstanceId: replacedActiveWithId,
              equippedAt: replacedActiveWithId ? nowMs() : null
            })
            .where(eq(activePet.userId, user.id))
            .run();
        }
      }
      tx.update(petInstances).set({ status: 'sold', resolvedAt: nowMs() }).where(eq(petInstances.id, pet.id)).run();
      finalBalance = wallet.amount + value;
      tx.update(balances).set({ amount: finalBalance }).where(eq(balances.userId, user.id)).run();
    });
    if (!soldActive) {
      return {
        ok: true,
        message: `Pet #${pet.id} sold for ${value} Molgium. New balance: ${finalBalance} Molgium.`
      };
    }
    if (replacedActiveWithId) {
      return {
        ok: true,
        message:
          `Pet #${pet.id} sold for ${value} Molgium. ` +
          `Active pet switched to #${replacedActiveWithId}. New balance: ${finalBalance} Molgium.`
      };
    }
    return {
      ok: true,
      message: `Pet #${pet.id} sold for ${value} Molgium. You have no active pet now. New balance: ${finalBalance} Molgium.`
    };
  }

  public async shardsView(discordId: string, username: string): Promise<number> {
    const user = await this.ensureUser(discordId, username);
    return this.getShardDisplayAmount(user.id);
  }

  public async forgeMythicEgg(discordId: string, username: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const debtLock = this.debtGuard(user.id, 'forging mythic eggs');
    if (!debtLock.ok) return debtLock;
    const costTenths = FORGE_MYTHIC_EGG_COST * 10;
    try {
      db.transaction((tx) => {
        const eggsRow = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
        if (!eggsRow) throw new Error('Missing shard/egg rows');
        if (this.getShardTenths(user.id) < costTenths) throw new Error(`Need ${FORGE_MYTHIC_EGG_COST} shards.`);
        tx.update(eggsInventory).set({ mythicEggs: eggsRow.mythicEggs + 1 }).where(eq(eggsInventory.userId, user.id)).run();
      });
      this.addShardsTenths(user.id, -costTenths);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Forge failed.' };
    }
    return { ok: true, message: 'Crafted 1 Mythic Egg for 250 shards.' };
  }

  public async profile(discordId: string, username: string): Promise<{
    balance: number;
    salaryBase: number;
    workReady: boolean;
    workStreak: number;
    workStreakBonusPct: number;
    activePet: string;
    activePetBonuses: string[];
    eggs: number;
    mythicEggs: number;
    shards: number;
    classPath: string;
    raidPower: number;
    setBonuses: string;
    dailyMissionsCompleted: number;
    dailyMissionsTotal: number;
    weeklyMissionsCompleted: number;
    weeklyMissionsTotal: number;
    lifetimeEggsHatched: number;
    rarestPetOwned: string;
    rarestFishOwned: string;
  }> {
    const user = await this.ensureUser(discordId, username);
    const wallet = db.select().from(balances).where(eq(balances.userId, user.id)).get();
    const eggs = db.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
    const raidSummary = this.computeRaidPower(user.id);
    const active = await this.getActivePet(user.id);
    const streak = this.getEffectiveWorkStreak(user.id);
    const streakBonusPct = Math.min(streak * WORK_STREAK_BONUS_PER_DAY, WORK_STREAK_BONUS_CAP);
    const activePetBonuses: string[] = [];
    if (active) {
      if (active.petType === 'Worker') {
        const multiplier = PET_WORKER_MULTIPLIER[active.rarity];
        activePetBonuses.push(`Work payout multiplier: x${multiplier.toFixed(2)} (+${formatPercent((multiplier - 1) * 100)})`);
      }
      if (active.petType === 'Fisher') {
        activePetBonuses.push(`Fish rarity bump chance: ${formatPercent(PET_FISHER_BUMP_CHANCE[active.rarity] * 100)}`);
        activePetBonuses.push(`Fish sell bonus: +${formatPercent(PET_FISHER_SELL_BONUS[active.rarity] * 100)}`);
      }
      if (active.petType === 'Gambler') {
        activePetBonuses.push(`Gamble win bonus: +${formatPercent(PET_GAMBLER_WIN_BONUS[active.rarity] * 100)} (wins only)`);
      }
      if (active.petType === 'Event') {
        activePetBonuses.push(`Egg event win bonus: +${PET_EVENT_BONUS[active.rarity]} Molgium`);
      }
      if (active.petType === 'Raid') {
        activePetBonuses.push(
          `Raid loot chance bonus: +${formatPercent(PET_RAID_LOOT_BONUS_CHANCE[active.rarity] * 100)}`
        );
        activePetBonuses.push(
          `Raid win Molgium bonus: +${formatPercent(PET_RAID_MOLGIUM_WIN_BONUS[active.rarity] * 100)}`
        );
      }
    }
    const missionStates = MISSION_DEFINITIONS.map((mission) => ({
      mission,
      state: this.missionProgress(user.id, mission)
    }));
    const dailyMissions = missionStates.filter((entry) => entry.mission.period === 'daily');
    const weeklyMissions = missionStates.filter((entry) => entry.mission.period === 'weekly');
    const owned = db.select().from(petsOwned).where(eq(petsOwned.userId, user.id)).all();
    const rarest =
      owned
        .map((entry) => entry.rarity as Rarity)
        .sort((a, b) => rarityRank[b] - rarityRank[a])[0] ?? 'None';
    const catches = db
      .select({
        fishKey: fishCatches.fishKey,
        caughtName: fishCatches.caughtName,
        rarity: fishCatches.rarity,
        finalValue: fishCatches.finalValue
      })
      .from(fishCatches)
      .where(eq(fishCatches.userId, user.id))
      .all();
    const rarestFish = catches
      .map((entry) => {
        const fish = resolveFishInfo(entry.fishKey, entry.rarity);
        return {
          displayName: entry.caughtName?.trim() ? entry.caughtName : fish.displayName,
          rarity: fish.rarity,
          finalValue: Number(entry.finalValue ?? 0)
        };
      })
      .sort(
        (a, b) =>
          fishRarityRank[b.rarity] - fishRarityRank[a.rarity] ||
          b.finalValue - a.finalValue ||
          a.displayName.localeCompare(b.displayName)
      )[0];
    return {
      balance: wallet?.amount ?? 0,
      salaryBase: user.salaryBase,
      workReady: !isSameWorkWindow(user.lastWorkAt ?? null, nowMs(), appEnv.TIMEZONE, DAILY_RESET_HOUR),
      workStreak: streak,
      workStreakBonusPct: streakBonusPct * 100,
      activePet: active
        ? `${active.generatedName} - ${active.rarity} ${active.petType} (#${active.petInstanceId})`
        : 'None',
      activePetBonuses,
      eggs: eggs?.eggs ?? 0,
      mythicEggs: eggs?.mythicEggs ?? 0,
      shards: this.getShardDisplayAmount(user.id),
      classPath: raidSummary.classPath,
      raidPower: raidSummary.power,
      setBonuses: raidSummary.setBonuses,
      dailyMissionsCompleted: dailyMissions.filter((entry) => entry.state.completed).length,
      dailyMissionsTotal: dailyMissions.length,
      weeklyMissionsCompleted: weeklyMissions.filter((entry) => entry.state.completed).length,
      weeklyMissionsTotal: weeklyMissions.length,
      lifetimeEggsHatched: user.lifetimeEggsHatched,
      rarestPetOwned: rarest,
      rarestFishOwned: rarestFish ? `${rarestFish.displayName} [${rarestFish.rarity}]` : 'None'
    };
  }

  public async leaderboard(
    mode: 'richest' | 'most_eggs_hatched' | 'most_mythics' | 'top_fish_value'
  ): Promise<Array<{ username: string; value: number; detail?: string }>> {
    if (mode === 'richest') {
      const rows = db
        .select({ username: users.username, value: balances.amount })
        .from(users)
        .innerJoin(balances, eq(users.id, balances.userId))
        .orderBy(desc(balances.amount))
        .limit(10)
        .all();
      return rows.map((row) => ({ username: row.username, value: row.value }));
    }
    if (mode === 'most_eggs_hatched') {
      const rows = db
        .select({ username: users.username, value: users.lifetimeEggsHatched })
        .from(users)
        .orderBy(desc(users.lifetimeEggsHatched))
        .limit(10)
        .all();
      return rows.map((row) => ({ username: row.username, value: row.value }));
    }
    if (mode === 'most_mythics') {
      const rows = db
        .select({ userId: petInstances.userId, value: sql<number>`count(*)` })
        .from(petInstances)
        .where(eq(petInstances.rarity, 'Mythic'))
        .groupBy(petInstances.userId)
        .orderBy(desc(sql`count(*)`))
        .limit(10)
        .all();
      return rows.map((row) => {
        const user = db.select().from(users).where(eq(users.id, row.userId)).get();
        return { username: user?.username ?? `user-${row.userId}`, value: Number(row.value ?? 0) };
      });
    }
    const rows = db
      .select({
        userId: fishCatches.userId,
        value: fishCatches.finalValue,
        fishKey: fishCatches.fishKey,
        rarity: fishCatches.rarity
      })
      .from(fishCatches)
      .orderBy(desc(fishCatches.finalValue))
      .limit(10)
      .all();
    return rows.map((row) => {
      const user = db.select().from(users).where(eq(users.id, row.userId)).get();
      const fish = resolveFishInfo(row.fishKey, row.rarity);
      return {
        username: user?.username ?? `user-${row.userId}`,
        value: Number(row.value ?? 0),
        detail: `${fish.displayName} [${fish.rarity}]`
      };
    });
  }

  public hof(): Array<{ username: string; entry: string; rarity: string; at: number }> {
    const petRows = db
      .select()
      .from(mythicHallOfFame)
      .orderBy(desc(mythicHallOfFame.hatchedAt))
      .limit(20)
      .all();
    const fishRows = db
      .select()
      .from(fishHallOfFame)
      .orderBy(desc(fishHallOfFame.recordedAt))
      .limit(20)
      .all();

    const combined = [
      ...petRows.map((row) => {
        const user = db.select().from(users).where(eq(users.id, row.userId)).get();
        return {
          username: user?.username ?? `user-${row.userId}`,
          entry: `Pet Hatch - ${row.rarity} ${row.petType}`,
          rarity: row.rarity,
          at: row.hatchedAt
        };
      }),
      ...fishRows.map((row) => {
        const user = db.select().from(users).where(eq(users.id, row.userId)).get();
        return {
          username: user?.username ?? `user-${row.userId}`,
          entry: `Fish Catch - ${row.fishName}`,
          rarity: row.rarity,
          at: row.recordedAt
        };
      })
    ];

    return combined.sort((a, b) => b.at - a.at).slice(0, 20);
  }

  public async adminGiveMolgium(discordId: string, amount: number): Promise<{ ok: boolean; message: string }> {
    const user = await this.getUser(discordId);
    try {
      this.changeBalance(user.id, amount);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Failed to credit Molgium.' };
    }
    return { ok: true, message: `Granted ${amount} Molgium to ${user.username}.` };
  }

  public async adminGiveEgg(discordId: string, amount: number): Promise<{ ok: boolean; message: string }> {
    const user = await this.getUser(discordId);
    db.transaction((tx) => {
      const eggs = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
      if (!eggs) throw new Error('Egg inventory missing');
      tx.update(eggsInventory).set({ eggs: eggs.eggs + amount }).where(eq(eggsInventory.userId, user.id)).run();
    });
    return { ok: true, message: `Granted ${amount} eggs to ${user.username}.` };
  }

  public adminSetTreasury(amount: number): { ok: boolean; message: string } {
    db.update(treasury).set({ amount, updatedAt: nowMs() }).where(eq(treasury.id, 1)).run();
    return { ok: true, message: `Treasury set to ${amount}.` };
  }
}

export interface ServiceContainer {
  game: MolgianService;
}

export const createServices = (): ServiceContainer => ({
  game: new MolgianService()
});
