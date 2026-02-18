import { REST, Routes, type Client } from 'discord.js';
import { appEnv, getDiscordEnv } from '../config/env.js';
import { commandJson } from '../commands/definitions.js';
import { logger } from '../utils/logger.js';

export const registerCommands = async (client: Client): Promise<void> => {
  const { DISCORD_TOKEN, GUILD_ID } = getDiscordEnv();
  const applicationId = client.application?.id;
  if (!applicationId) {
    throw new Error('Client application ID unavailable. Ensure client is ready.');
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  if (appEnv.REGISTER_GLOBAL_COMMANDS) {
    await rest.put(Routes.applicationCommands(applicationId), {
      body: commandJson
    });
    logger.info(`Registered ${commandJson.length} global commands.`);
    return;
  }

  await rest.put(Routes.applicationGuildCommands(applicationId, GUILD_ID), {
    body: commandJson
  });
  logger.info(`Registered ${commandJson.length} guild commands for ${GUILD_ID}.`);
};
