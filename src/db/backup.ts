import fs from 'node:fs';
import path from 'node:path';
import { appEnv } from '../config/env.js';
import { sqliteDb } from './client.js';

const safeReason = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'manual';
};

const backupFilePrefix = (): string => {
  if (!appEnv.DATABASE_FILE_PATH) return 'database';
  const parsed = path.parse(appEnv.DATABASE_FILE_PATH);
  return parsed.name.length > 0 ? parsed.name : 'database';
};

const pruneBackups = (directory: string, maxFiles = 30): void => {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
    .map((entry) => {
      const fullPath = path.join(directory, entry.name);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const overflow = entries.slice(maxFiles);
  for (const file of overflow) {
    fs.unlinkSync(file.fullPath);
  }
};

export const createSqliteBackup = async (reason = 'manual'): Promise<string | null> => {
  if (!appEnv.DATABASE_FILE_PATH || !appEnv.DATABASE_BACKUP_DIR) return null;

  fs.mkdirSync(appEnv.DATABASE_BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${backupFilePrefix()}-${safeReason(reason)}-${timestamp}.db`;
  const fullPath = path.join(appEnv.DATABASE_BACKUP_DIR, filename);

  await sqliteDb.backup(fullPath);
  pruneBackups(appEnv.DATABASE_BACKUP_DIR, 30);

  return fullPath;
};
