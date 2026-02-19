import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createSqliteBackup } from './backup.js';
import { db } from './client.js';

export const runMigrations = async (): Promise<void> => {
  const backupPath = await createSqliteBackup('pre-migrate');
  if (backupPath) {
    console.log(`SQLite backup saved: ${backupPath}`);
  }
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
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
