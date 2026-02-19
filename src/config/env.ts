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
  DATABASE_BACKUP_DIR: z.string().optional().default(''),
  SQLITE_DATA_DIR: z.string().optional().default(''),
  ALLOW_UNSAFE_REPO_DB_PATH: z.enum(['true', 'false']).optional().default('false'),
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

const isPathInside = (childPath: string, parentPath: string): boolean => {
  const relative = path.relative(parentPath, childPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const resolveProductionSqlitePath = (currentPath: string): string => {
  if (env.NODE_ENV !== 'production') return currentPath;
  if (env.ALLOW_UNSAFE_REPO_DB_PATH === 'true') return currentPath;

  const repoRoot = path.resolve(process.cwd());
  if (!isPathInside(currentPath, repoRoot)) return currentPath;

  const dataDir =
    env.SQLITE_DATA_DIR.trim().length > 0
      ? path.resolve(env.SQLITE_DATA_DIR.trim())
      : path.resolve(repoRoot, '..', 'molgian-bureau-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const targetPath = path.join(dataDir, path.basename(currentPath));

  if (fs.existsSync(currentPath) && !fs.existsSync(targetPath)) {
    fs.copyFileSync(currentPath, targetPath);
    console.warn(`[Molgian Bureau] Copied production DB to safe path: ${targetPath}`);
  }

  console.warn(
    `[Molgian Bureau] Using safe production DB path outside repo: ${targetPath}. ` +
      'Set SQLITE_DATA_DIR and DATABASE_BACKUP_DIR in .env to control this explicitly.'
  );
  return targetPath;
};

const initialDatabaseFilePath = resolveDatabasePath(env.DATABASE_URL);
const databaseFilePath = initialDatabaseFilePath ? resolveProductionSqlitePath(initialDatabaseFilePath) : null;
if (databaseFilePath) {
  fs.mkdirSync(path.dirname(databaseFilePath), { recursive: true });
}

const databaseBackupDir =
  databaseFilePath === null
    ? null
    : env.DATABASE_BACKUP_DIR.trim().length > 0
      ? path.resolve(env.DATABASE_BACKUP_DIR.trim())
      : path.resolve(path.dirname(databaseFilePath), 'backups');
if (databaseBackupDir) {
  fs.mkdirSync(databaseBackupDir, { recursive: true });
}

export const appEnv = {
  ...env,
  REGISTER_GLOBAL_COMMANDS: env.REGISTER_GLOBAL_COMMANDS === 'true',
  ADMIN_USER_IDS: env.ADMIN_USER_IDS
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
  ALLOW_SERVER_ADMINS: env.ALLOW_SERVER_ADMINS === 'true',
  ALLOW_UNSAFE_REPO_DB_PATH: env.ALLOW_UNSAFE_REPO_DB_PATH === 'true',
  DATABASE_FILE_PATH: databaseFilePath,
  DATABASE_BACKUP_DIR: databaseBackupDir
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
