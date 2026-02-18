import { EmbedBuilder } from 'discord.js';
import { BOT_NAME } from '../domain/gameConfig.js';

export type EmbedTone = 'info' | 'success' | 'warning' | 'error' | 'event';

const EMBED_COLORS: Record<EmbedTone, number> = {
  info: 0x3498db,
  success: 0x2ecc71,
  warning: 0xf1c40f,
  error: 0xe74c3c,
  event: 0x1abc9c
};

const EMBED_DESCRIPTION_LIMIT = 4090;

const clampDescription = (value: string): string =>
  value.length <= EMBED_DESCRIPTION_LIMIT
    ? value
    : `${value.slice(0, EMBED_DESCRIPTION_LIMIT - 3)}...`;

export const createBotEmbed = (
  description: string,
  options?: { tone?: EmbedTone; title?: string }
): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[options?.tone ?? 'info'])
    .setDescription(clampDescription(description))
    .setFooter({ text: BOT_NAME })
    .setTimestamp();

  if (options?.title) {
    embed.setTitle(options.title);
  }

  return embed;
};
