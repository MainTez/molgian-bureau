import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { appEnv } from '../config/env.js';
import * as schema from './schema.js';

if (!appEnv.DATABASE_FILE_PATH) {
  throw new Error(
    'Postgres URL detected. Launch version currently supports SQLite only. Keep DATABASE_URL as file:...'
  );
}

const sqlite = new Database(appEnv.DATABASE_FILE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export const sqliteDb = sqlite;
export type BotDb = typeof db;
