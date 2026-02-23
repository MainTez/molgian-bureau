import {
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction
} from 'discord.js';
import { appEnv } from '../config/env.js';
import type { ServiceContainer } from '../services.js';
import { createBotEmbed, type EmbedTone } from './embeds.js';
import { CLAIM_CITIZENS_ROLE_BUTTON_ID } from './citizensRole.js';

const PURGE_OLD_DELETE_DELAY_MS = 150;
const GAME_ANNOUNCEMENT_TEXT =
  'GAME COMING OUT SOON: https://maintez.itch.io/untitled-mmo-lite (PASSWORD: Annie123)';

const isPrivilegedAdmin = (interaction: ChatInputCommandInteraction): boolean => {
  const isListedAdmin = appEnv.ADMIN_USER_IDS.includes(interaction.user.id);
  const isServerAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  return isListedAdmin || (appEnv.ALLOW_SERVER_ADMINS && isServerAdmin);
};

const buildEmbedOptions = (options?: {
  tone?: EmbedTone;
  title?: string;
}): { tone?: EmbedTone; title?: string } => ({
  ...(options?.tone ? { tone: options.tone } : {}),
  ...(options?.title ? { title: options.title } : {})
});

const replyWithEmbed = async (
  interaction: ChatInputCommandInteraction,
  message: string,
  options?: { ephemeral?: boolean; tone?: EmbedTone; title?: string }
): Promise<void> => {
  await interaction.reply({
    embeds: [createBotEmbed(message, buildEmbedOptions(options))],
    ephemeral: options?.ephemeral ?? false
  });
};

const editReplyWithEmbed = async (
  interaction: ChatInputCommandInteraction,
  message: string,
  options?: { tone?: EmbedTone; title?: string }
): Promise<void> => {
  await interaction.editReply({
    embeds: [createBotEmbed(message, buildEmbedOptions(options))]
  });
};

export const handleInteraction = async (
  interaction: ChatInputCommandInteraction,
  _services: ServiceContainer
): Promise<void> => {
  if (interaction.commandName === 'game') {
    await replyWithEmbed(interaction, GAME_ANNOUNCEMENT_TEXT, { title: 'Game' });
    return;
  }

  if (interaction.commandName === 'purge') {
    if (!isPrivilegedAdmin(interaction)) {
      await replyWithEmbed(
        interaction,
        'Admin command blocked. Ask bot owner to add your user ID to ADMIN_USER_IDS in .env.',
        { ephemeral: true, tone: 'error', title: 'Admin' }
      );
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const channel = interaction.channel;
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
    ) {
      await replyWithEmbed(interaction, 'This command can only be used in a server text channel.', {
        ephemeral: true,
        tone: 'warning',
        title: 'Purge'
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const fetched = await channel.messages.fetch({ limit: amount });
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const unpinned = fetched.filter((message) => !message.pinned);
    const recent = unpinned.filter((message) => now - message.createdTimestamp < fourteenDaysMs);
    const old = unpinned.filter((message) => now - message.createdTimestamp >= fourteenDaysMs);
    const skippedPinned = fetched.size - unpinned.size;

    let deletedRecent = 0;
    let failedRecent = 0;
    if (recent.size > 0) {
      try {
        const deleted = await channel.bulkDelete(recent, true);
        deletedRecent = deleted.size;
        failedRecent = Math.max(0, recent.size - deletedRecent);
      } catch {
        failedRecent = recent.size;
      }
    }

    let deletedOld = 0;
    let failedOld = 0;
    const oldMessages = [...old.values()];
    for (const [index, message] of oldMessages.entries()) {
      try {
        await message.delete();
        deletedOld += 1;
      } catch {
        failedOld += 1;
      }
      if (index < oldMessages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, PURGE_OLD_DELETE_DELAY_MS));
      }
    }

    const deletedCount = deletedRecent + deletedOld;
    const failedCount = failedRecent + failedOld;

    await editReplyWithEmbed(
      interaction,
      `Purged ${deletedCount} message(s): ${deletedRecent} recent + ${deletedOld} old. ` +
        `Skipped ${skippedPinned} pinned.` +
        `${failedCount > 0 ? ` Failed to delete ${failedCount} message(s).` : ''}`,
      { tone: 'success', title: 'Purge' }
    );
    return;
  }

  await replyWithEmbed(interaction, 'Command not implemented.', {
    ephemeral: true,
    tone: 'warning'
  });
};

export const handleButtonInteraction = async (
  interaction: ButtonInteraction,
  _services: ServiceContainer
): Promise<void> => {
  if (interaction.customId !== CLAIM_CITIZENS_ROLE_BUTTON_ID) return;
  await interaction.reply({
    embeds: [
      createBotEmbed('Citizens role panel is disabled while game systems are offline.', {
        tone: 'warning',
        title: 'Unavailable'
      })
    ],
    ephemeral: true
  });
};
