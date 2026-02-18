import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1).optional(),
  GUILD_ID: z.string().min(1).optional(),
  TIMEZONE: z.string().default('Europe/Oslo'),
  EVENT_CHANNEL_NAME: z.string().default('Special Place'),
  FANDOM_WIKI_BASE_URL: z.string().url().default('https://www.fandom.com'),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REGISTER_GLOBAL_COMMANDS: z.enum(['true', 'false']).optional().default('false'),
  ADMIN_USER_IDS: z.string().optional().default(''),
  ALLOW_SERVER_ADMINS: z.enum(['true', 'false']).optional().default('false')
});

const env = envSchema.parse(process.env);

const resolveDatabasePath = (databaseUrl: string): string | null => {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return null;
  }
  const normalized = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl;
  return path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
};

const databaseFilePath = resolveDatabasePath(env.DATABASE_URL);
if (databaseFilePath) {
  fs.mkdirSync(path.dirname(databaseFilePath), { recursive: true });
}

export const appEnv = {
  ...env,
  REGISTER_GLOBAL_COMMANDS: env.REGISTER_GLOBAL_COMMANDS === 'true',
  ADMIN_USER_IDS: env.ADMIN_USER_IDS
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
  ALLOW_SERVER_ADMINS: env.ALLOW_SERVER_ADMINS === 'true',
  DATABASE_FILE_PATH: databaseFilePath
};

export const getDiscordEnv = (): { DISCORD_TOKEN: string; GUILD_ID: string } => {
  if (!appEnv.DISCORD_TOKEN || !appEnv.GUILD_ID) {
    throw new Error('DISCORD_TOKEN and GUILD_ID are required for Discord runtime commands.');
  }
  return {
    DISCORD_TOKEN: appEnv.DISCORD_TOKEN,
    GUILD_ID: appEnv.GUILD_ID
  };
};
