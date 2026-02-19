import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  type Guild,
  type GuildMember,
  type Message,
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
  FISH_RARITY_BASE_WEIGHTS,
  FISH_BASE_VALUES,
  FISH_COOLDOWN_MS,
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
  PET_TYPES,
  PET_WORKER_MULTIPLIER,
  RAISE_TIERS,
  ROD_CONFIG,
  ROTATING_SHOP_SIZE,
  SELL_VALUES,
  SHARD_VALUES,
  WORK_ROBBERY_CHANCE,
  type FishRarity
} from './domain/gameConfig.js';
import { canUserWinEgg } from './domain/eggs/scheduling.js';
import { selectMicroEvent } from './domain/events/microEventSelector.js';
import { calculateJackpotTax } from './domain/gambling/tax.js';
import { bumpFishRarity, rollChance, rollFishRarity, rollHatchRarity } from './domain/rolls.js';
import { db } from './db/client.js';
import {
  activePet,
  appState,
  balances,
  cosmeticsOwned,
  dailyShopRotation,
  eggsInventory,
  eventRuns,
  fishCatches,
  fishCollection,
  jackpotEntries,
  jackpotRounds,
  loadout,
  mythicHallOfFame,
  petInstances,
  petsOwned,
  raisesOwned,
  rodsOwned,
  shards,
  treasury,
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

const cosmeticsPool = {
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

type CosmeticSlot = keyof typeof cosmeticsPool;
type ShopItem = (typeof cosmeticsPool)[CosmeticSlot][number] & { slot: CosmeticSlot };
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

const speedTypePrompts = [
  'Molgium never sleeps',
  'Special Place supremacy',
  'Bureau chaos approved',
  'No eggs for cowards'
];
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

const FISH_RARITY_SORT_DESC: FishRarity[] = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common', 'Trash'];
const fishRarityRank: Record<FishRarity, number> = {
  Trash: 0,
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
  Mythic: 5
};
const rodTierRank: Record<RodTier, number> = {
  starter: 1,
  improved: 2,
  elite: 3
};

const formatPercent = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
};

const formatSignedPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatPercent(Math.abs(value))}`;
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
  { key: 'mythic_catch', displayName: 'Mythic Catch', rarity: 'Mythic' as FishRarity }
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

  private activeUsers = new Map<string, number>();

  private activeEggState: ActiveEggState | null = null;

  private majorTimer: NodeJS.Timeout | null = null;

  private microTimer: NodeJS.Timeout | null = null;

  private eggInterval: NodeJS.Timeout | null = null;

  private jackpotInterval: NodeJS.Timeout | null = null;

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
  }

  public noteUserActive(discordId: string): void {
    this.activeUsers.set(discordId, nowMs());
  }

  private currentWindowStart(timestampMs = nowMs()): number {
    return getWorkWindowStart(timestampMs, appEnv.TIMEZONE, DAILY_RESET_HOUR);
  }

  private currentDayKey(timestampMs = nowMs()): string {
    return toDayKey(this.currentWindowStart(timestampMs), appEnv.TIMEZONE);
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
      if (rarity === 'Mythic') {
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
      if (existing.username !== username) {
        db.update(users).set({ username, updatedAt: nowMs() }).where(eq(users.id, existing.id)).run();
      }
      return existing;
    }
    const timestamp = nowMs();
    const user = db
      .insert(users)
      .values({
        discordId,
        username,
        salaryBase: 100,
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
    db.insert(loadout)
      .values({ userId: user.id, titleId: null, badgeId: null, frameId: null, updatedAt: timestamp })
      .run();
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
      if (next < 0) throw new Error('Insufficient Molgium');
      tx.update(balances).set({ amount: next }).where(eq(balances.userId, userId)).run();
      return next;
    });
  }

  private currentBalance(userId: number): number {
    return db.select().from(balances).where(eq(balances.userId, userId)).get()?.amount ?? 0;
  }

  private shardHalfStateKey(userId: number): string {
    return `shards:half:${userId}`;
  }

  private hasHalfShard(userId: number): boolean {
    return this.getState(this.shardHalfStateKey(userId)) === '1';
  }

  private setHalfShard(userId: number, value: boolean): void {
    this.setState(this.shardHalfStateKey(userId), value ? '1' : '0');
  }

  private getShardDisplayAmount(userId: number): number {
    const fullShards = db.select().from(shards).where(eq(shards.userId, userId)).get()?.amount ?? 0;
    return fullShards + (this.hasHalfShard(userId) ? 0.5 : 0);
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
    const payout = Math.floor(user.salaryBase * workerMultiplier * inflationMultiplier);
    const gotRobbed = rollChance(WORK_ROBBERY_CHANCE);
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
      if (!wallet) throw new Error('Wallet missing');
      tx.update(users).set({ lastWorkAt: nowMs(), updatedAt: nowMs() }).where(eq(users.id, user.id)).run();
      const nextBalance = gotRobbed ? wallet.amount : wallet.amount + payout;
      tx.update(balances).set({ amount: nextBalance }).where(eq(balances.userId, user.id)).run();
    });
    if (gotRobbed) {
      return {
        ok: true,
        message: `You got robbed on the way to work. Today paid 0 Molgium (lost ${payout}).`
      };
    }
    return { ok: true, message: `You earned ${payout} Molgium from /work.` };
  }

  public async raiseList(discordId: string, username: string): Promise<{
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

  public async raiseBuy(
    discordId: string,
    username: string,
    raiseId: number
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const tier = RAISE_TIERS.find((entry) => entry.id === raiseId);
    if (!tier) return { ok: false, message: 'Invalid raise id.' };
    const owned = db.select().from(raisesOwned).where(eq(raisesOwned.userId, user.id)).all();
    if (owned.some((entry) => entry.raiseId === raiseId)) return { ok: false, message: 'Raise already purchased.' };
    const maxOwned = owned.reduce((max, current) => Math.max(max, current.raiseId), 0);
    if (raiseId > maxOwned + 1) return { ok: false, message: 'Buy raises in order.' };
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        if (wallet.amount < tier.cost) throw new Error('Insufficient Molgium');
        tx.update(balances).set({ amount: wallet.amount - tier.cost }).where(eq(balances.userId, user.id)).run();
        tx.insert(raisesOwned).values({ userId: user.id, raiseId, purchasedAt: nowMs() }).run();
        tx.update(users).set({ salaryBase: tier.newSalaryBase, updatedAt: nowMs() }).where(eq(users.id, user.id)).run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Raise purchase failed.' };
    }
    return { ok: true, message: `Raise ${raiseId} purchased. SalaryBase now ${tier.newSalaryBase}.` };
  }

  private findShopItem(itemId: string): ShopItem | null {
    for (const slot of Object.keys(cosmeticsPool) as CosmeticSlot[]) {
      const found = cosmeticsPool[slot].find((entry) => entry.id === itemId);
      if (found) return { ...found, slot };
    }
    return null;
  }

  private getOrCreateDailyRotation(): string[] {
    const dayKey = this.currentDayKey();
    const existing = db.select().from(dailyShopRotation).where(eq(dailyShopRotation.dayKey, dayKey)).get();
    if (existing) return JSON.parse(existing.itemIdsJson) as string[];
    const ids = shuffle(
      [...cosmeticsPool.title, ...cosmeticsPool.badge, ...cosmeticsPool.frame].map((item) => item.id)
    ).slice(0, ROTATING_SHOP_SIZE);
    db.insert(dailyShopRotation)
      .values({ dayKey, itemIdsJson: JSON.stringify(ids), generatedAt: nowMs() })
      .onConflictDoUpdate({
        target: dailyShopRotation.dayKey,
        set: { itemIdsJson: JSON.stringify(ids), generatedAt: nowMs() }
      })
      .run();
    return ids;
  }

  public async getShop(
    discordId: string,
    username: string
  ): Promise<{ balance: number; rotating: ShopItem[] }> {
    const user = await this.ensureUser(discordId, username);
    const wallet = db.select().from(balances).where(eq(balances.userId, user.id)).get();
    const rotationIds = this.getOrCreateDailyRotation();
    return {
      balance: wallet?.amount ?? 0,
      rotating: rotationIds.map((id) => this.findShopItem(id)).filter((item): item is ShopItem => item !== null)
    };
  }

  public async buyShopItem(
    discordId: string,
    username: string,
    itemId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const rotation = this.getOrCreateDailyRotation();
    if (!rotation.includes(itemId)) return { ok: false, message: 'Item not in today\'s rotation.' };
    const item = this.findShopItem(itemId);
    if (!item) return { ok: false, message: 'Unknown item id.' };
    const owned = db
      .select()
      .from(cosmeticsOwned)
      .where(
        and(
          eq(cosmeticsOwned.userId, user.id),
          eq(cosmeticsOwned.slot, item.slot),
          eq(cosmeticsOwned.cosmeticId, item.id)
        )
      )
      .get();
    if (owned) return { ok: false, message: 'You already own this cosmetic.' };
    try {
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        if (wallet.amount < item.price) throw new Error('Insufficient Molgium');
        tx.update(balances).set({ amount: wallet.amount - item.price }).where(eq(balances.userId, user.id)).run();
        tx
          .insert(cosmeticsOwned)
          .values({
            userId: user.id,
            slot: item.slot,
            cosmeticId: item.id,
            acquiredAt: nowMs()
          })
          .run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Purchase failed.' };
    }
    return { ok: true, message: `Purchased ${item.name} for ${item.price} Molgium.` };
  }

  public async loadoutView(discordId: string, username: string): Promise<{
    titleId: string | null;
    badgeId: string | null;
    frameId: string | null;
  }> {
    const user = await this.ensureUser(discordId, username);
    const row = db.select().from(loadout).where(eq(loadout.userId, user.id)).get();
    if (!row) return { titleId: null, badgeId: null, frameId: null };
    return {
      titleId: row.titleId,
      badgeId: row.badgeId,
      frameId: row.frameId
    };
  }

  public async loadoutSet(
    discordId: string,
    username: string,
    slot: CosmeticSlot,
    itemId: string
  ): Promise<{ ok: boolean; message: string }> {
    const user = await this.ensureUser(discordId, username);
    const item = this.findShopItem(itemId);
    if (!item || item.slot !== slot) return { ok: false, message: `Invalid ${slot} item id.` };
    const owned = db
      .select()
      .from(cosmeticsOwned)
      .where(
        and(
          eq(cosmeticsOwned.userId, user.id),
          eq(cosmeticsOwned.slot, slot),
          eq(cosmeticsOwned.cosmeticId, itemId)
        )
      )
      .get();
    if (!owned) return { ok: false, message: `You do not own ${itemId}.` };
    const current = db.select().from(loadout).where(eq(loadout.userId, user.id)).get();
    if (!current) {
      db.insert(loadout)
        .values({
          userId: user.id,
          titleId: slot === 'title' ? itemId : null,
          badgeId: slot === 'badge' ? itemId : null,
          frameId: slot === 'frame' ? itemId : null,
          updatedAt: nowMs()
        })
        .run();
    } else {
      db.update(loadout)
        .set({
          titleId: slot === 'title' ? itemId : current.titleId,
          badgeId: slot === 'badge' ? itemId : current.badgeId,
          frameId: slot === 'frame' ? itemId : current.frameId,
          updatedAt: nowMs()
        })
        .where(eq(loadout.userId, user.id))
        .run();
    }
    return { ok: true, message: `${slot} set to ${itemId}.` };
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
    return `trash -${formatPercent(trashReduction)}, sell +${formatPercent(sellBonus)}, double +${formatPercent(doubleSellChance)}, rarity bump +${formatPercent(rarityBumpChance)}`;
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
    return [
      `Compared to ${current.name}:`,
      `trash ${formatSignedPercent(trashDelta)}, sell ${formatSignedPercent(sellDelta)}, double ${formatSignedPercent(doubleDelta)}, rarity bump ${formatSignedPercent(rarityDelta)}.`
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
    const cooldownKey = `fish:last:${user.id}`;
    const lastCast = this.getStateNumber(cooldownKey);
    if (lastCast && nowMs() - lastCast < FISH_COOLDOWN_MS) {
      const remaining = Math.ceil((FISH_COOLDOWN_MS - (nowMs() - lastCast)) / 1000);
      return { ok: false, message: `Fishing cooldown active: ${remaining}s remaining.` };
    }
    let rarity = rollFishRarity(rod.tier as RodTier, this.isBoostActive('event:fishing_madness_until'));
    if (Math.random() < ROD_CONFIG[rod.tier as RodTier].rarityBumpChance) rarity = bumpFishRarity(rarity);
    const active = await this.getActivePet(user.id);
    if (active?.petType === 'Fisher' && Math.random() < PET_FISHER_BUMP_CHANCE[active.rarity]) {
      rarity = bumpFishRarity(rarity);
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
    let value = Math.floor(randomIntInclusive(minValue, maxValue) * ROD_CONFIG[rod.tier as RodTier].sellBonusMultiplier);
    let doubled = false;
    if (Math.random() < ROD_CONFIG[rod.tier as RodTier].doubleSellChance) {
      value *= 2;
      doubled = true;
    }
    const specialName =
      rarity === 'Legendary' || rarity === 'Mythic'
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
    this.setState(cooldownKey, String(nowMs()));
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
      let finalBalance = 0;
      db.transaction((tx) => {
        const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
        if (!wallet) throw new Error('Wallet missing');
        tx.update(fishCatches)
          .set({ soldAt: nowMs() })
          .where(and(eq(fishCatches.userId, user.id), isNull(fishCatches.soldAt)))
          .run();
        finalBalance = wallet.amount + payout;
        tx.update(balances).set({ amount: finalBalance }).where(eq(balances.userId, user.id)).run();
      });
      return {
        ok: true,
        message:
          `Sold ${unsoldRows.length} catches for ${payout} Molgium` +
          `${fisherBonusTotal > 0 ? ` (${baseTotal} + ${fisherBonusTotal} Fisher bonus)` : ''}. ` +
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
    let finalBalance = 0;
    db.transaction((tx) => {
      const wallet = tx.select().from(balances).where(eq(balances.userId, user.id)).get();
      if (!wallet) throw new Error('Wallet missing');
      tx.update(fishCatches).set({ soldAt: nowMs() }).where(eq(fishCatches.id, row.id)).run();
      finalBalance = wallet.amount + payout;
      tx.update(balances).set({ amount: finalBalance }).where(eq(balances.userId, user.id)).run();
    });
    return {
      ok: true,
      message:
        `Sold catch ${row.id} for ${payout} Molgium` +
        `${fisherBonus > 0 ? ` (${row.finalValue} + ${fisherBonus} Fisher bonus)` : ''}. ` +
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

  public fishRarityGuideText(): string {
    const totalWeight = Object.values(FISH_RARITY_BASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    const catchLabelByRarity: Record<FishRarity, string> = {
      Trash: 'Trash Catch',
      Common: 'Common Catch',
      Rare: 'Rare Catch',
      Epic: 'Epic Catch',
      Legendary: 'Legendary Catch',
      Mythic: 'Mythic Catch'
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
    if (amount <= 0) return { ok: false, message: 'Amount must be positive.' };
    let postBetBalance = 0;
    try {
      postBetBalance = this.changeBalance(user.id, -amount);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Insufficient Molgium.' };
    }
    const won = Math.random() < 0.5;
    if (!won) {
      return {
        ok: true,
        message: `Coinflip loss. Lost ${amount} Molgium. New balance: ${postBetBalance} Molgium.`
      };
    }
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
    if (amount <= 0) return { ok: false, message: 'Amount must be positive.' };
    let postBetBalance = 0;
    try {
      postBetBalance = this.changeBalance(user.id, -amount);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Insufficient Molgium.' };
    }
    const player = randomIntInclusive(1, 6);
    const house = randomIntInclusive(1, 6);
    if (player <= house) {
      return {
        ok: true,
        message: `Dice loss (${player} vs ${house}). Lost ${amount}. New balance: ${postBetBalance} Molgium.`
      };
    }
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
      message: `Entered jackpot with ${amount} Molgium. Winner weight has a 30% per-user cap.`
    };
  }

  public jackpotStatus(): {
    header: string;
    entries: Array<{ username: string; amount: number; effectiveWeightPct: number }>;
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
    const cap = Math.floor(round.totalPool * 0.3);
    return {
      header: `Round #${round.id} pool ${round.totalPool} Molgium`,
      entries: grouped.map((entry) => {
        const user = db.select().from(users).where(eq(users.id, entry.userId)).get();
        const value = Number(entry.amount ?? 0);
        const effective = Math.min(value, cap);
        return {
          username: user?.username ?? `user-${entry.userId}`,
          amount: value,
          effectiveWeightPct: round.totalPool === 0 ? 0 : Number(((effective / round.totalPool) * 100).toFixed(2))
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
    const cap = Math.floor(round.totalPool * 0.3);
    const weighted = grouped.map((entry) => ({
      userId: entry.userId,
      effective: Math.max(1, Math.min(Number(entry.amount ?? 0), cap))
    }));
    const winnerUserId = weightedPick(weighted.map((entry) => ({ item: entry.userId, weight: entry.effective })));
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
    this.eggInterval = setInterval(() => {
      void this.tickEggSpawner();
    }, 20_000);
    this.jackpotInterval = setInterval(() => {
      void this.resolveJackpotIfReady();
    }, 30_000);
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

  private async sendEventMessage(content: string, title = 'Special Place'): Promise<void> {
    if (!this.eventChannel) return;
    await this.eventChannel.send({ embeds: [this.eventEmbed(content, title)] });
  }

  private async sendEventPing(content: string, title = 'Special Place'): Promise<void> {
    if (!this.eventChannel) return;
    await this.eventChannel.send({
      content: '@everyone',
      embeds: [this.eventEmbed(content, title)],
      allowedMentions: { parse: ['everyone'] }
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

  public async runEvent(name: EventName): Promise<void> {
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
    const lastWinnerDiscordId = this.getState('egg:last_winner_discord_id');
    if (!canUserWinEgg(lastWinnerDiscordId, discordId)) {
      throw new Error('No back-to-back egg wins allowed.');
    }
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
    this.setState('egg:last_winner_discord_id', discordId);
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
      content: '@everyone',
      embeds: [
        this.eventEmbed(`Egg Event [Speed Type]: type exactly:\n\`${phrase}\`${forced ? ' (forced)' : ''}`, 'Egg Event')
      ],
      allowedMentions: { parse: ['everyone'] }
    });
    const winner = await new Promise<Message | null>((resolve) => {
      const collector = this.eventChannel!.createMessageCollector({
        time: EGG_EVENT_WINDOW_MS,
        filter: (message) => !message.author.bot && message.content.trim() === phrase
      });
      let resolved = false;
      collector.on('collect', async (message) => {
        if (resolved) return;
        if (!canUserWinEgg(this.getState('egg:last_winner_discord_id'), message.author.id)) {
          await this.sendEventMessage(`${message.author.username} cannot win back-to-back Egg events.`, 'Egg Event');
          return;
        }
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
      content: '@everyone',
      embeds: [
        this.eventEmbed(
          `Egg Event [Reaction Lock]: press the correct lock within 2 minutes.${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      allowedMentions: { parse: ['everyone'] },
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
        if (!canUserWinEgg(this.getState('egg:last_winner_discord_id'), interaction.user.id)) {
          await interaction.reply({
            embeds: [createBotEmbed('No back-to-back egg wins allowed.', { tone: 'warning', title: 'Egg Event' })],
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
      content: '@everyone',
      embeds: [
        this.eventEmbed(
          `Egg Event [Emoji Memory]: memorize for 5 seconds\n${sequence.join(' ')}${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      allowedMentions: { parse: ['everyone'] }
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
        if (!canUserWinEgg(this.getState('egg:last_winner_discord_id'), msg.author.id)) {
          await this.sendEventMessage(`${msg.author.username} cannot win back-to-back.`, 'Egg Event');
          return;
        }
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
      content: '@everyone',
      embeds: [
        this.eventEmbed(
          `Egg Event [Rapid Choice]: press the correct button in 2 minutes.${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      allowedMentions: { parse: ['everyone'] },
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
        if (!canUserWinEgg(this.getState('egg:last_winner_discord_id'), interaction.user.id)) {
          await interaction.reply({
            embeds: [createBotEmbed('No back-to-back wins.', { tone: 'warning', title: 'Egg Event' })],
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
      content: '@everyone',
      embeds: [
        this.eventEmbed(
          `Egg Event [Quick Duel]: ${duelists.map((m) => `<@${m.id}>`).join(' vs ')}${forced ? ' (forced)' : ''}`,
          'Egg Event'
        )
      ],
      allowedMentions: { parse: ['everyone'] },
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
        if (!canUserWinEgg(this.getState('egg:last_winner_discord_id'), interaction.user.id)) {
          await interaction.reply({
            embeds: [createBotEmbed('No back-to-back wins.', { tone: 'warning', title: 'Egg Event' })],
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
      if (rarity === 'Common') {
        const hadHalf = this.hasHalfShard(user.id);
        const fullShardGain = hadHalf ? 1 : 0;
        db.transaction((tx) => {
          const row = tx.select().from(shards).where(eq(shards.userId, user.id)).get();
          if (!row) throw new Error('shards row missing');
          tx.update(petInstances).set({ status: 'sharded', resolvedAt: nowMs() }).where(eq(petInstances.id, pet.id)).run();
          tx.update(shards).set({ amount: row.amount + fullShardGain }).where(eq(shards.userId, user.id)).run();
        });
        this.setHalfShard(user.id, !hadHalf);
        const afterAmount = this.getShardDisplayAmount(user.id);
        return {
          ok: true,
          message: `Pet #${pet.id} sharded for 0.5 shards. Shards: ${this.formatShardAmount(beforeAmount)} -> ${this.formatShardAmount(afterAmount)}.`
        };
      }
      db.transaction((tx) => {
        const row = tx.select().from(shards).where(eq(shards.userId, user.id)).get();
        if (!row) throw new Error('shards row missing');
        tx.update(petInstances).set({ status: 'sharded', resolvedAt: nowMs() }).where(eq(petInstances.id, pet.id)).run();
        tx.update(shards).set({ amount: row.amount + gain }).where(eq(shards.userId, user.id)).run();
      });
      const afterAmount = this.getShardDisplayAmount(user.id);
      return {
        ok: true,
        message: `Pet #${pet.id} sharded for ${gain} shards. Shards: ${this.formatShardAmount(beforeAmount)} -> ${this.formatShardAmount(afterAmount)}.`
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
    try {
      db.transaction((tx) => {
        const shardRow = tx.select().from(shards).where(eq(shards.userId, user.id)).get();
        const eggsRow = tx.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
        if (!shardRow || !eggsRow) throw new Error('Missing shard/egg rows');
        if (shardRow.amount < FORGE_MYTHIC_EGG_COST) throw new Error(`Need ${FORGE_MYTHIC_EGG_COST} shards.`);
        tx.update(shards).set({ amount: shardRow.amount - FORGE_MYTHIC_EGG_COST }).where(eq(shards.userId, user.id)).run();
        tx.update(eggsInventory).set({ mythicEggs: eggsRow.mythicEggs + 1 }).where(eq(eggsInventory.userId, user.id)).run();
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Forge failed.' };
    }
    return { ok: true, message: 'Crafted 1 Mythic Egg for 250 shards.' };
  }

  public async profile(discordId: string, username: string): Promise<{
    balance: number;
    salaryBase: number;
    workReady: boolean;
    activePet: string;
    eggs: number;
    mythicEggs: number;
    shards: number;
    loadout: { title: string | null; badge: string | null; frame: string | null };
    lifetimeEggsHatched: number;
    rarestPetOwned: string;
    rarestFishOwned: string;
  }> {
    const user = await this.ensureUser(discordId, username);
    const wallet = db.select().from(balances).where(eq(balances.userId, user.id)).get();
    const eggs = db.select().from(eggsInventory).where(eq(eggsInventory.userId, user.id)).get();
    const loadoutRow = db.select().from(loadout).where(eq(loadout.userId, user.id)).get();
    const active = await this.getActivePet(user.id);
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
      activePet: active
        ? `${active.generatedName} - ${active.rarity} ${active.petType} (#${active.petInstanceId})`
        : 'None',
      eggs: eggs?.eggs ?? 0,
      mythicEggs: eggs?.mythicEggs ?? 0,
      shards: this.getShardDisplayAmount(user.id),
      loadout: {
        title: loadoutRow?.titleId ?? null,
        badge: loadoutRow?.badgeId ?? null,
        frame: loadoutRow?.frameId ?? null
      },
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

  public hof(): Array<{ username: string; petType: string; rarity: string; hatchedAt: number }> {
    const rows = db.select().from(mythicHallOfFame).orderBy(desc(mythicHallOfFame.hatchedAt)).limit(20).all();
    return rows.map((row) => {
      const user = db.select().from(users).where(eq(users.id, row.userId)).get();
      return {
        username: user?.username ?? `user-${row.userId}`,
        petType: row.petType,
        rarity: row.rarity,
        hatchedAt: row.hatchedAt
      };
    });
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
