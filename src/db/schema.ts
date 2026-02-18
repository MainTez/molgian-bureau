import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    discordId: text('discord_id').notNull().unique(),
    username: text('username').notNull(),
    salaryBase: integer('salary_base').notNull().default(100),
    lastWorkAt: integer('last_work_at'),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    lifetimeEggsHatched: integer('lifetime_eggs_hatched').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    salaryBasePositive: check('users_salary_base_positive', sql`${table.salaryBase} >= 0`)
  })
);

export const balances = sqliteTable(
  'balances',
  {
    userId: integer('user_id')
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull().default(0)
  },
  (table) => ({
    nonNegative: check('balances_non_negative', sql`${table.amount} >= 0`)
  })
);

export const treasury = sqliteTable(
  'treasury',
  {
    id: integer('id').primaryKey(),
    amount: integer('amount').notNull().default(0),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    nonNegative: check('treasury_non_negative', sql`${table.amount} >= 0`)
  })
);

export const raisesOwned = sqliteTable(
  'raises_owned',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    raiseId: integer('raise_id').notNull(),
    purchasedAt: integer('purchased_at').notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.raiseId] })
  })
);

export const rodsOwned = sqliteTable(
  'rods_owned',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    equipped: integer('equipped').notNull().default(0),
    purchasedAt: integer('purchased_at').notNull()
  },
  (table) => ({
    uniqueOwnedTier: unique('rods_owned_user_tier_unique').on(table.userId, table.tier)
  })
);

export const fishCatches = sqliteTable(
  'fish_catches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fishKey: text('fish_key').notNull(),
    caughtName: text('caught_name'),
    rarity: text('rarity').notNull(),
    season: text('season').notNull(),
    baseValue: integer('base_value').notNull(),
    finalValue: integer('final_value').notNull(),
    soldAt: integer('sold_at'),
    caughtAt: integer('caught_at').notNull()
  },
  (table) => ({
    userIdx: index('fish_catches_user_idx').on(table.userId),
    soldIdx: index('fish_catches_sold_idx').on(table.soldAt)
  })
);

export const fishCollection = sqliteTable(
  'fish_collection',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fishKey: text('fish_key').notNull(),
    count: integer('count').notNull().default(1),
    bestValue: integer('best_value').notNull().default(0),
    firstCaughtAt: integer('first_caught_at').notNull(),
    lastCaughtAt: integer('last_caught_at').notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.fishKey] })
  })
);

export const jackpotRounds = sqliteTable(
  'jackpot_rounds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    closedAt: integer('closed_at'),
    winnerUserId: integer('winner_user_id').references(() => users.id, { onDelete: 'set null' }),
    totalPool: integer('total_pool').notNull().default(0),
    taxCollected: integer('tax_collected').notNull().default(0)
  },
  (table) => ({
    statusIdx: index('jackpot_rounds_status_idx').on(table.status)
  })
);

export const jackpotEntries = sqliteTable(
  'jackpot_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roundId: integer('round_id')
      .notNull()
      .references(() => jackpotRounds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    enteredAt: integer('entered_at').notNull()
  },
  (table) => ({
    roundIdx: index('jackpot_entries_round_idx').on(table.roundId),
    userIdx: index('jackpot_entries_user_idx').on(table.userId)
  })
);

export const eggsInventory = sqliteTable(
  'eggs_inventory',
  {
    userId: integer('user_id')
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    eggs: integer('eggs').notNull().default(0),
    mythicEggs: integer('mythic_eggs').notNull().default(0),
    lastWinAt: integer('last_win_at')
  },
  (table) => ({
    eggsNonNegative: check('eggs_inventory_non_negative', sql`${table.eggs} >= 0`),
    mythicEggsNonNegative: check('mythic_eggs_inventory_non_negative', sql`${table.mythicEggs} >= 0`)
  })
);

export const petsOwned = sqliteTable(
  'pets_owned',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petType: text('pet_type').notNull(),
    rarity: text('rarity').notNull(),
    count: integer('count').notNull().default(1),
    firstOwnedAt: integer('first_owned_at').notNull()
  },
  (table) => ({
    uniqOwned: unique('pets_owned_user_type_rarity').on(table.userId, table.petType, table.rarity)
  })
);

export const petInstances = sqliteTable(
  'pet_instances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petType: text('pet_type').notNull(),
    rarity: text('rarity').notNull(),
    generatedName: text('generated_name').notNull().default('mystery companion'),
    generatedTypeLabel: text('generated_type_label').notNull().default('fisher type'),
    sourceEggType: text('source_egg_type').notNull().default('normal'),
    status: text('status').notNull().default('kept'),
    createdAt: integer('created_at').notNull(),
    resolvedAt: integer('resolved_at')
  },
  (table) => ({
    userIdx: index('pet_instances_user_idx').on(table.userId),
    statusIdx: index('pet_instances_status_idx').on(table.status)
  })
);

export const activePet = sqliteTable('active_pet', {
  userId: integer('user_id')
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  petInstanceId: integer('pet_instance_id').references(() => petInstances.id, { onDelete: 'set null' }),
  equippedAt: integer('equipped_at')
});

export const shards = sqliteTable(
  'shards',
  {
    userId: integer('user_id')
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull().default(0)
  },
  (table) => ({
    nonNegative: check('shards_non_negative', sql`${table.amount} >= 0`)
  })
);

export const cosmeticsOwned = sqliteTable(
  'cosmetics_owned',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    cosmeticId: text('cosmetic_id').notNull(),
    acquiredAt: integer('acquired_at').notNull()
  },
  (table) => ({
    uniqCosmetic: unique('cosmetics_owned_user_slot_cosmetic').on(table.userId, table.slot, table.cosmeticId)
  })
);

export const loadout = sqliteTable('loadout', {
  userId: integer('user_id')
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  titleId: text('title_id'),
  badgeId: text('badge_id'),
  frameId: text('frame_id'),
  updatedAt: integer('updated_at').notNull()
});

export const mythicHallOfFame = sqliteTable(
  'mythic_hall_of_fame',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petInstanceId: integer('pet_instance_id')
      .notNull()
      .references(() => petInstances.id, { onDelete: 'cascade' }),
    petType: text('pet_type').notNull(),
    rarity: text('rarity').notNull(),
    channelId: text('channel_id').notNull(),
    hatchedAt: integer('hatched_at').notNull()
  },
  (table) => ({
    hatchedIdx: index('mythic_hof_hatched_idx').on(table.hatchedAt)
  })
);

export const wikiPages = sqliteTable(
  'wiki_pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    titleIdx: index('wiki_pages_title_idx').on(table.title),
    updatedIdx: index('wiki_pages_updated_idx').on(table.updatedAt)
  })
);

export const dailyShopRotation = sqliteTable(
  'daily_shop_rotation',
  {
    dayKey: text('day_key').notNull().primaryKey(),
    itemIdsJson: text('item_ids_json').notNull(),
    generatedAt: integer('generated_at').notNull()
  },
  (table) => ({
    generatedIdx: index('daily_shop_rotation_generated_idx').on(table.generatedAt)
  })
);

export const eventRuns = sqliteTable(
  'event_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventType: text('event_type').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    winnerUserId: integer('winner_user_id').references(() => users.id, { onDelete: 'set null' }),
    detailsJson: text('details_json')
  },
  (table) => ({
    typeIdx: index('event_runs_type_idx').on(table.eventType),
    startedIdx: index('event_runs_started_idx').on(table.startedAt)
  })
);

export const appState = sqliteTable('app_state', {
  key: text('key').notNull().primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export const PET_TYPES = ['Worker', 'Fisher', 'Gambler', 'Event'] as const;
export const ROD_TIERS = ['starter', 'improved', 'elite'] as const;

export type Rarity = (typeof RARITIES)[number];
export type PetType = (typeof PET_TYPES)[number];
export type RodTier = (typeof ROD_TIERS)[number];
