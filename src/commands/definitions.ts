import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { PET_TYPES, RARITIES, ROD_TIERS } from '../db/schema.js';
import {
  BASE_CLASS_DEFINITIONS,
  RAID_BOSSES,
  type BaseClassKey,
  type ClassQuizGoal,
  type ClassQuizStyle,
  type ClassQuizVibe,
  type RaidDifficultyKey,
  type ShopCategory
} from '../domain/endgame.js';

type SupportedBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

const classPathChoices = BASE_CLASS_DEFINITIONS.flatMap((entry) =>
  entry.paths.map((path) => ({
    name: `${entry.name} -> ${path.name}`,
    value: path.key
  }))
);

const classMainChoices = BASE_CLASS_DEFINITIONS.map((entry) => ({
  name: entry.name,
  value: entry.key
}));

const shopCategoryChoices: Array<{ name: string; value: ShopCategory }> = [
  { name: 'weapons', value: 'weapons' },
  { name: 'armor', value: 'armor' },
  { name: 'materials', value: 'materials' },
  { name: 'rods', value: 'rods' },
  { name: 'jobs', value: 'jobs' }
];

const classQuizStyleChoices: Array<{ name: string; value: ClassQuizStyle }> = [
  { name: 'aggressive', value: 'aggressive' },
  { name: 'defensive', value: 'defensive' },
  { name: 'trickster', value: 'trickster' },
  { name: 'support', value: 'support' },
  { name: 'balanced', value: 'balanced' }
];

const classQuizGoalChoices: Array<{ name: string; value: ClassQuizGoal }> = [
  { name: 'wealth', value: 'wealth' },
  { name: 'raids', value: 'raids' },
  { name: 'fishing', value: 'fishing' },
  { name: 'events', value: 'events' },
  { name: 'hybrid', value: 'hybrid' }
];

const classQuizVibeChoices: Array<{ name: string; value: ClassQuizVibe }> = [
  { name: 'lawful', value: 'lawful' },
  { name: 'chaotic', value: 'chaotic' },
  { name: 'mystic', value: 'mystic' },
  { name: 'tech', value: 'tech' },
  { name: 'hunter', value: 'hunter' }
];

const raidDifficultyChoices: Array<{ name: string; value: RaidDifficultyKey }> = [
  { name: 'normal', value: 'normal' },
  { name: 'hard', value: 'hard' },
  { name: 'nightmare', value: 'nightmare' },
  { name: 'infernal', value: 'infernal' }
];

const gearSlotChoices = [
  { name: 'weapon', value: 'weapon' },
  { name: 'helmet', value: 'helmet' },
  { name: 'chest', value: 'chest' },
  { name: 'gloves', value: 'gloves' },
  { name: 'boots', value: 'boots' },
  { name: 'relic', value: 'relic' }
] as const;

export const slashCommandDefinitions: SupportedBuilder[] = [
  new SlashCommandBuilder().setName('work').setDescription('Claim your daily Molgium salary.'),
  new SlashCommandBuilder()
    .setName('job')
    .setDescription('View and apply for jobs that increase your salary.')
    .addSubcommand((sub) => sub.setName('list').setDescription('List available jobs.'))
    .addSubcommand((sub) =>
      sub
        .setName('apply')
        .setDescription('Apply for a job by ID.')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Job ID to apply for').setRequired(true).setMinValue(1)
        )
    ),
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse categories and buy gear/materials.')
    .addSubcommand((sub) => sub.setName('view').setDescription('View available shop categories.'))
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('View all offers in one category.')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Category')
            .setRequired(true)
            .addChoices(...shopCategoryChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy a shop item by id.')
        .addStringOption((opt) =>
          opt.setName('item_id').setDescription('Item id from /shop category').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('quantity').setDescription('Quantity').setRequired(false).setMinValue(1).setMaxValue(999)
        )
    ),
  new SlashCommandBuilder()
    .setName('class')
    .setDescription('Manage your class path progression.')
    .addSubcommand((sub) => sub.setName('list').setDescription('View base classes and paths.'))
    .addSubcommand((sub) =>
      sub
        .setName('quiz')
        .setDescription('Get a class recommendation.')
        .addStringOption((opt) =>
          opt
            .setName('style')
            .setDescription('How you like to play')
            .setRequired(true)
            .addChoices(...classQuizStyleChoices)
        )
        .addStringOption((opt) =>
          opt
            .setName('goal')
            .setDescription('What you care about most')
            .setRequired(true)
            .addChoices(...classQuizGoalChoices)
        )
        .addStringOption((opt) =>
          opt
            .setName('vibe')
            .setDescription('Your preferred fantasy')
            .setRequired(true)
            .addChoices(...classQuizVibeChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('choose')
        .setDescription('Buy and choose your base class.')
        .addStringOption((opt) =>
          opt
            .setName('main')
            .setDescription('Base class')
            .setRequired(true)
            .addChoices(...classMainChoices)
        )
    )
    .addSubcommand((sub) => sub.setName('path').setDescription('View your current class path.'))
    .addSubcommand((sub) =>
      sub
        .setName('advance')
        .setDescription('Select your T2 path (locks T3 specialization).')
        .addStringOption((opt) =>
          opt
            .setName('path')
            .setDescription('T2 path choice')
            .setRequired(true)
            .addChoices(...classPathChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset class progression at high cost.')
        .addBooleanOption((opt) =>
          opt.setName('confirm').setDescription('Type true to confirm reset').setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Manage your gear inventory and equipment.')
    .addSubcommand((sub) => sub.setName('inventory').setDescription('View owned gear.'))
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip a gear item to a slot.')
        .addStringOption((opt) =>
          opt
            .setName('slot')
            .setDescription('Gear slot')
            .setRequired(true)
            .addChoices(...gearSlotChoices)
        )
        .addIntegerOption((opt) =>
          opt.setName('gear_id').setDescription('Gear instance id').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('unequip')
        .setDescription('Unequip one gear slot.')
        .addStringOption((opt) =>
          opt
            .setName('slot')
            .setDescription('Gear slot')
            .setRequired(true)
            .addChoices(...gearSlotChoices)
        )
    ),
  new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Create and run co-op raid lobbies.')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new raid lobby.')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Boss target')
            .setRequired(true)
            .addChoices(...RAID_BOSSES.map((entry) => ({ name: entry.name, value: entry.key })))
        )
        .addStringOption((opt) =>
          opt
            .setName('difficulty')
            .setDescription('Raid difficulty')
            .setRequired(true)
            .addChoices(...raidDifficultyChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('join')
        .setDescription('Join an active raid lobby by code.')
        .addStringOption((opt) =>
          opt
            .setName('code')
            .setDescription('Lobby code')
            .setRequired(true)
            .setMinLength(4)
            .setMaxLength(12)
        )
    )
    .addSubcommand((sub) => sub.setName('leave').setDescription('Leave your current raid lobby.'))
    .addSubcommand((sub) => sub.setName('start').setDescription('Start your owned raid lobby.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View your current raid lobby status.'))
    .addSubcommand((sub) => sub.setName('history').setDescription('View your recent raid history.')),
  new SlashCommandBuilder()
    .setName('rod')
    .setDescription('Buy and equip fishing rods.')
    .addSubcommand((sub) => sub.setName('shop').setDescription('Show available rods.'))
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy a rod tier.')
        .addStringOption((opt) =>
          opt
            .setName('tier')
            .setDescription('Rod tier')
            .setRequired(true)
            .addChoices(
              ...ROD_TIERS.map((tier) => ({
                name: tier,
                value: tier
              }))
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip an owned rod tier.')
        .addStringOption((opt) =>
          opt
            .setName('tier')
            .setDescription('Rod tier')
            .setRequired(true)
            .addChoices(
              ...ROD_TIERS.map((tier) => ({
                name: tier,
                value: tier
              }))
            )
        )
    ),
  new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Fish with your currently equipped rod.')
    .addSubcommand((sub) => sub.setName('cast').setDescription('Cast your line.'))
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('Sell a catch by id, "last", or "all".')
        .addStringOption((opt) =>
          opt.setName('catch_id').setDescription('Catch id, "last", or "all"').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('collection').setDescription('View your fish collection.'))
    .addSubcommand((sub) => sub.setName('value').setDescription('View unsold fish inventory value.'))
    .addSubcommand((sub) => sub.setName('rarities').setDescription('View fish rarity guide.'))
    .addSubcommand((sub) => sub.setName('index').setDescription('View the server fish index book.')),
  new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Try your luck with Molgium.')
    .addSubcommand((sub) =>
      sub
        .setName('coinflip')
        .setDescription('50/50 coinflip.')
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Molgium amount').setRequired(true).setMinValue(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('dice')
        .setDescription('High dice beats house dice.')
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Molgium amount').setRequired(true).setMinValue(50)
        )
    ),
  new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('Enter and inspect jackpot rounds.')
    .addSubcommand((sub) =>
      sub
        .setName('enter')
        .setDescription('Enter current jackpot round.')
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Molgium amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('View jackpot status.')),
  new SlashCommandBuilder().setName('treasury').setDescription('View the Molgian Bureau Treasury.'),
  new SlashCommandBuilder()
    .setName('hatch')
    .setDescription('Hatch one egg with suspense roll.')
    .addStringOption((opt) =>
      opt
        .setName('egg_type')
        .setDescription('Egg type to hatch')
        .setRequired(false)
        .addChoices(
          { name: 'normal', value: 'normal' },
          { name: 'mythic', value: 'mythic' }
        )
    ),
  new SlashCommandBuilder().setName('pets').setDescription('List your pet instances.'),
  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your pets.')
    .addSubcommand((sub) => sub.setName('rarities').setDescription('View pet hatch rarity rates.'))
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip a pet instance.')
        .addIntegerOption((opt) =>
          opt.setName('pet_instance_id').setDescription('Pet instance id').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('keep')
        .setDescription('Keep a duplicate pending pet.')
        .addIntegerOption((opt) =>
          opt.setName('pet_instance_id').setDescription('Pet instance id').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('shard')
        .setDescription('Convert duplicate pending pet to shards.')
        .addIntegerOption((opt) =>
          opt.setName('pet_instance_id').setDescription('Pet instance id').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('Sell a kept or pending pet for Molgium.')
        .addIntegerOption((opt) =>
          opt.setName('pet_instance_id').setDescription('Pet instance id').setRequired(true).setMinValue(1)
        )
    ),
  new SlashCommandBuilder().setName('shards').setDescription('View your current shard count.'),
  new SlashCommandBuilder()
    .setName('forge')
    .setDescription('Craft and manage endgame equipment.')
    .addSubcommand((sub) => sub.setName('materials').setDescription('View your crafting materials.'))
    .addSubcommand((sub) => sub.setName('recipes').setDescription('View forge recipes.'))
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Preview a forge recipe.')
        .addStringOption((opt) =>
          opt.setName('recipe_id').setDescription('Recipe id from /forge recipes').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('craft')
        .setDescription('Craft one forge recipe.')
        .addStringOption((opt) =>
          opt.setName('recipe_id').setDescription('Recipe id from /forge recipes').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('salvage')
        .setDescription('Salvage a gear item for materials.')
        .addIntegerOption((opt) =>
          opt.setName('gear_id').setDescription('Gear instance id').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName('mythic_egg').setDescription('Craft one Mythic Egg (250 shards).')),
  new SlashCommandBuilder()
    .setName('missions')
    .setDescription('View and claim daily/weekly missions.')
    .addSubcommand((sub) => sub.setName('view').setDescription('View mission progress.'))
    .addSubcommand((sub) =>
      sub
        .setName('claim')
        .setDescription('Claim a completed mission reward.')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('Mission ID')
            .setRequired(true)
            .addChoices(
              { name: 'daily_cast_5', value: 'daily_cast_5' },
              { name: 'daily_gamble_3', value: 'daily_gamble_3' },
              { name: 'daily_work_1', value: 'daily_work_1' },
              { name: 'weekly_sell_40', value: 'weekly_sell_40' },
              { name: 'weekly_hatch_8', value: 'weekly_hatch_8' },
              { name: 'weekly_gamble_win_12', value: 'weekly_gamble_win_12' }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile or another user profile.')
    .addUserOption((opt) => opt.setName('user').setDescription('Optional user to view').setRequired(false)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View a leaderboard.')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Leaderboard mode')
        .setRequired(true)
        .addChoices(
          { name: 'richest', value: 'richest' },
          { name: 'most_eggs_hatched', value: 'most_eggs_hatched' },
          { name: 'most_mythics', value: 'most_mythics' },
          { name: 'top_fish_value', value: 'top_fish_value' }
        )
    ),
  new SlashCommandBuilder().setName('patchnotes').setDescription('View recent bot updates.'),
  new SlashCommandBuilder().setName('hof').setDescription('View Hall of Fame history.'),
  new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('Open Molgian Bureau Fandom wiki links.')
    .addSubcommand((sub) => sub.setName('home').setDescription('Open the Fandom wiki home link.'))
    .addSubcommand((sub) =>
      sub
        .setName('page')
        .setDescription('Open a specific wiki page.')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Page title').setRequired(true).setMinLength(2).setMaxLength(80)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Search your Fandom wiki.')
        .addStringOption((opt) =>
          opt.setName('query').setDescription('Search text').setRequired(true).setMinLength(2).setMaxLength(80)
        )
    ),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a batch of recent messages in this channel (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('How many recent messages to purge (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin-only economy controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('give-molgium')
        .setDescription('Give Molgium to a user.')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('give-egg')
        .setDescription('Give eggs to a user.')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Egg amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('force-event')
        .setDescription('Force run an event by name.')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Event name')
            .setRequired(true)
            .addChoices(
              { name: 'pickpocket', value: 'pickpocket' },
              { name: 'claim_rush', value: 'claim_rush' },
              { name: 'stimulus_drop', value: 'stimulus_drop' },
              { name: 'tax_audit', value: 'tax_audit' },
              { name: 'inflation_spike', value: 'inflation_spike' },
              { name: 'egg_rate_boost', value: 'egg_rate_boost' },
              { name: 'fishing_madness', value: 'fishing_madness' },
              { name: 'coinflip_chaos', value: 'coinflip_chaos' },
              { name: 'egg_spawn', value: 'egg_spawn' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-treasury')
        .setDescription('Set treasury to exact amount.')
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub
        .setName('post-citizens-panel')
        .setDescription('Post or refresh the Citizens role button panel in #Immigration-Center.')
    )
];

export const commandJson = slashCommandDefinitions.map((command) => command.toJSON());

export const isValidPetType = (value: string): value is (typeof PET_TYPES)[number] =>
  PET_TYPES.includes(value as (typeof PET_TYPES)[number]);

export const isValidRarity = (value: string): value is (typeof RARITIES)[number] =>
  RARITIES.includes(value as (typeof RARITIES)[number]);

export const isValidClassMain = (value: string): value is BaseClassKey =>
  classMainChoices.some((entry) => entry.value === value);
