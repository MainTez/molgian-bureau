import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { PET_TYPES, RARITIES, ROD_TIERS } from '../db/schema.js';

type SupportedBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

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
    .setDescription('View the current shop or buy a rotating cosmetic.')
    .addStringOption((opt) =>
      opt.setName('buy_id').setDescription('Optional rotating cosmetic id to buy').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('loadout')
    .setDescription('View or set your cosmetic loadout.')
    .addSubcommand((sub) => sub.setName('view').setDescription('View current loadout.'))
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('Set loadout slot.')
        .addSubcommand((sub) =>
          sub
            .setName('title')
            .setDescription('Set title cosmetic.')
            .addStringOption((opt) => opt.setName('id').setDescription('Cosmetic ID').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('badge')
            .setDescription('Set badge cosmetic.')
            .addStringOption((opt) => opt.setName('id').setDescription('Cosmetic ID').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('frame')
            .setDescription('Set frame cosmetic.')
            .addStringOption((opt) => opt.setName('id').setDescription('Cosmetic ID').setRequired(true))
        )
    ),
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
          opt.setName('amount').setDescription('Molgium amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('dice')
        .setDescription('High dice beats house dice.')
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Molgium amount').setRequired(true).setMinValue(1)
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
    .setDescription('Craft high-tier items.')
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
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Optional user to view').setRequired(false)
    ),
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
    .addSubcommand((sub) =>
      sub
        .setName('home')
        .setDescription('Open the Fandom wiki home link.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('page')
        .setDescription('Open a specific wiki page.')
        .addStringOption((opt) =>
          opt
            .setName('title')
            .setDescription('Page title')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(80)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Search your Fandom wiki.')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setDescription('Search text')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(80)
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
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)
        )
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
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0)
        )
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
