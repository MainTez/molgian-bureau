import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

type SupportedBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

export const slashCommandDefinitions: SupportedBuilder[] = [
  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Show info about the upcoming game release.'),
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
    )
];

export const commandJson = slashCommandDefinitions.map((command) => command.toJSON());
