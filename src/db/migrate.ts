import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';

export const runMigrations = (): void => {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
};

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations();
  console.log('Migrations applied.');
}
