import { Client, GatewayIntentBits } from 'discord.js';
import { getDiscordEnv } from '../config/env.js';
import { registerCommands } from './registerCommands.js';

const { DISCORD_TOKEN } = getDiscordEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  try {
    await registerCommands(client);
    console.log('Commands registered.');
  } catch (error) {
    console.error('Command registration failed', error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

void client.login(DISCORD_TOKEN);
