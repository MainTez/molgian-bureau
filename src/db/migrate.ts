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

const ensureTable = (tableName: string, createSql: string): void => {
  const existed = tableExists(tableName);
  sqliteDb.exec(createSql);
  if (!existed) {
    console.warn(`[Molgian Bureau] Repaired missing table: ${tableName}`);
  }
};

const ensureCriticalTables = (): void => {
  ensureTable(
    'user_class_progress',
    `
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
    `
  );

  ensureTable(
    'crafting_materials',
    `
      CREATE TABLE IF NOT EXISTS crafting_materials (
        user_id integer NOT NULL,
        material_key text NOT NULL,
        amount integer DEFAULT 0 NOT NULL,
        updated_at integer NOT NULL,
        PRIMARY KEY(user_id, material_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
        CONSTRAINT crafting_materials_non_negative CHECK(amount >= 0)
      );
    `
  );

  ensureTable(
    'gear_instances',
    `
      CREATE TABLE IF NOT EXISTS gear_instances (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id integer NOT NULL,
        template_key text NOT NULL,
        name text NOT NULL,
        slot text NOT NULL,
        rarity text NOT NULL,
        class_affinity text,
        set_key text,
        source text NOT NULL,
        power integer DEFAULT 0 NOT NULL,
        guard integer DEFAULT 0 NOT NULL,
        crit integer DEFAULT 0 NOT NULL,
        haste integer DEFAULT 0 NOT NULL,
        precision integer DEFAULT 0 NOT NULL,
        resolve integer DEFAULT 0 NOT NULL,
        yield integer DEFAULT 0 NOT NULL,
        scavenge integer DEFAULT 0 NOT NULL,
        luck_control integer DEFAULT 0 NOT NULL,
        created_at integer NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
    `
  );

  ensureTable(
    'user_gear_equips',
    `
      CREATE TABLE IF NOT EXISTS user_gear_equips (
        user_id integer NOT NULL,
        slot text NOT NULL,
        gear_instance_id integer,
        equipped_at integer NOT NULL,
        PRIMARY KEY(user_id, slot),
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (gear_instance_id) REFERENCES gear_instances(id) ON UPDATE no action ON DELETE set null
      );
    `
  );

  ensureTable(
    'raid_lobbies',
    `
      CREATE TABLE IF NOT EXISTS raid_lobbies (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        code text NOT NULL,
        owner_user_id integer NOT NULL,
        boss_key text NOT NULL,
        difficulty text NOT NULL,
        status text NOT NULL,
        channel_id text,
        created_at integer NOT NULL,
        expires_at integer NOT NULL,
        started_at integer,
        ended_at integer,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
    `
  );

  ensureTable(
    'raid_lobby_members',
    `
      CREATE TABLE IF NOT EXISTS raid_lobby_members (
        lobby_id integer NOT NULL,
        user_id integer NOT NULL,
        joined_at integer NOT NULL,
        PRIMARY KEY(lobby_id, user_id),
        FOREIGN KEY (lobby_id) REFERENCES raid_lobbies(id) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
    `
  );

  ensureTable(
    'raid_runs',
    `
      CREATE TABLE IF NOT EXISTS raid_runs (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        lobby_id integer,
        boss_key text NOT NULL,
        difficulty text NOT NULL,
        mutator text,
        stage_count integer NOT NULL,
        status text NOT NULL,
        victory integer DEFAULT 0 NOT NULL,
        started_at integer NOT NULL,
        ended_at integer,
        summary_json text,
        FOREIGN KEY (lobby_id) REFERENCES raid_lobbies(id) ON UPDATE no action ON DELETE set null
      );
    `
  );

  ensureTable(
    'raid_run_members',
    `
      CREATE TABLE IF NOT EXISTS raid_run_members (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        run_id integer NOT NULL,
        user_id integer NOT NULL,
        contribution integer DEFAULT 0 NOT NULL,
        reward_molgium integer DEFAULT 0 NOT NULL,
        egg_dropped integer DEFAULT 0 NOT NULL,
        materials_json text,
        created_at integer NOT NULL,
        FOREIGN KEY (run_id) REFERENCES raid_runs(id) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
      );
    `
  );

  sqliteDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS raid_lobbies_code_unique ON raid_lobbies(code);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_lobbies_status_idx ON raid_lobbies(status);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_lobbies_expires_idx ON raid_lobbies(expires_at);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_lobby_members_user_idx ON raid_lobby_members(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_runs_started_idx ON raid_runs(started_at);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_runs_status_idx ON raid_runs(status);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_run_members_run_idx ON raid_run_members(run_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS raid_run_members_user_idx ON raid_run_members(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS gear_instances_user_idx ON gear_instances(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS gear_instances_slot_idx ON gear_instances(slot);`);
  sqliteDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS user_gear_equips_gear_unique ON user_gear_equips(gear_instance_id);`);
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
