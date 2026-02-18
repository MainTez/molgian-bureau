import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { ServiceContainer } from '../services.js';

export interface BotContext {
  services: ServiceContainer;
}

export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, ctx: BotContext) => Promise<void>;
}
