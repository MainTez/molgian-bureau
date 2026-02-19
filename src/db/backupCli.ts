import { createSqliteBackup } from './backup.js';

const reason = process.argv[2] ?? 'manual';

try {
  const backupPath = await createSqliteBackup(reason);
  if (!backupPath) {
    console.log('SQLite backup skipped: DATABASE_URL is not file-based.');
    process.exit(0);
  }
  console.log(`Backup created: ${backupPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Backup failed: ${message}`);
  process.exit(1);
}
