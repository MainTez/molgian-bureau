import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createSqliteBackup } from './backup.js';
import { db, sqliteDb } from './client.js';

const tableExists = (tableName: string): boolean => {
  const row = sqliteDb
    .prepare(`select 1 as present from sqlite_master where type = 'table' and name = ? limit 1`)
    .get(tableName) as { present: number } | undefined;
  return Boolean(row?.present);
};

const ensureCriticalTables = (): void => {
  if (!tableExists('user_class_progress')) {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS user_class_progress (
        user_id integer PRIMARY KEY NOT NULL,
        base_class_key text,
        t2_path_key text,
        t3_spec_key text,
        quiz_recommendation text,
        reset_count integer DEFAULT 0 NOT NULL,
        selected_at integer,
        advanced_at integer,
        updated_at integer NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
    `);
    console.warn('[Molgian Bureau] Repaired missing table: user_class_progress');
  }
};

export const runMigrations = async (): Promise<void> => {
  const backupPath = await createSqliteBackup('pre-migrate');
  if (backupPath) {
    console.log(`SQLite backup saved: ${backupPath}`);
  }
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
  ensureCriticalTables();
};

if (process.argv[1]?.endsWith('migrate.ts')) {
  void runMigrations()
    .then(() => {
      console.log('Migrations applied.');
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Migrations failed: ${message}`);
      process.exit(1);
    });
}
