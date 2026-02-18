import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getDiscordEnv } from './config/env.js';
import { registerCommands } from './discord/registerCommands.js';
import { handleInteraction } from './discord/interactionHandler.js';
import { runMigrations } from './db/migrate.js';
import { createServices } from './services.js';
import { logger } from './utils/logger.js';
import { createBotEmbed } from './discord/embeds.js';

const { DISCORD_TOKEN } = getDiscordEnv();

runMigrations();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const services = createServices();

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`);
  await services.game.initialize(client);
  await registerCommands(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleInteraction(interaction, services);
  } catch (error) {
    logger.error('Interaction failed', { error: String(error) });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [createBotEmbed('Command failed. Check logs.', { tone: 'error', title: 'Error' })],
        ephemeral: true
      });
    } else if (interaction.deferred) {
      await interaction.editReply({
        embeds: [createBotEmbed('Command failed. Check logs.', { tone: 'error', title: 'Error' })]
      });
    }
  }
});

process.on('SIGINT', () => {
  services.game.shutdown();
  client.destroy();
  process.exit(0);
});

void client.login(DISCORD_TOKEN);
