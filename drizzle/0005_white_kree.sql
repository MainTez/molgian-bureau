CREATE TABLE `crafting_materials` (
	`user_id` integer NOT NULL,
	`material_key` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `material_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "crafting_materials_non_negative" CHECK("crafting_materials"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `gear_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`template_key` text NOT NULL,
	`name` text NOT NULL,
	`slot` text NOT NULL,
	`rarity` text NOT NULL,
	`class_affinity` text,
	`set_key` text,
	`source` text NOT NULL,
	`power` integer DEFAULT 0 NOT NULL,
	`guard` integer DEFAULT 0 NOT NULL,
	`crit` integer DEFAULT 0 NOT NULL,
	`haste` integer DEFAULT 0 NOT NULL,
	`precision` integer DEFAULT 0 NOT NULL,
	`resolve` integer DEFAULT 0 NOT NULL,
	`yield` integer DEFAULT 0 NOT NULL,
	`scavenge` integer DEFAULT 0 NOT NULL,
	`luck_control` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gear_instances_user_idx` ON `gear_instances` (`user_id`);--> statement-breakpoint
CREATE INDEX `gear_instances_slot_idx` ON `gear_instances` (`slot`);--> statement-breakpoint
CREATE TABLE `raid_lobbies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`owner_user_id` integer NOT NULL,
	`boss_key` text NOT NULL,
	`difficulty` text NOT NULL,
	`status` text NOT NULL,
	`channel_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raid_lobbies_code_unique` ON `raid_lobbies` (`code`);--> statement-breakpoint
CREATE INDEX `raid_lobbies_status_idx` ON `raid_lobbies` (`status`);--> statement-breakpoint
CREATE INDEX `raid_lobbies_expires_idx` ON `raid_lobbies` (`expires_at`);--> statement-breakpoint
CREATE TABLE `raid_lobby_members` (
	`lobby_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`lobby_id`, `user_id`),
	FOREIGN KEY (`lobby_id`) REFERENCES `raid_lobbies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `raid_lobby_members_user_idx` ON `raid_lobby_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `raid_run_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`contribution` integer DEFAULT 0 NOT NULL,
	`reward_molgium` integer DEFAULT 0 NOT NULL,
	`egg_dropped` integer DEFAULT 0 NOT NULL,
	`materials_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `raid_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `raid_run_members_run_idx` ON `raid_run_members` (`run_id`);--> statement-breakpoint
CREATE INDEX `raid_run_members_user_idx` ON `raid_run_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `raid_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lobby_id` integer,
	`boss_key` text NOT NULL,
	`difficulty` text NOT NULL,
	`mutator` text,
	`stage_count` integer NOT NULL,
	`status` text NOT NULL,
	`victory` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`summary_json` text,
	FOREIGN KEY (`lobby_id`) REFERENCES `raid_lobbies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `raid_runs_started_idx` ON `raid_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `raid_runs_status_idx` ON `raid_runs` (`status`);--> statement-breakpoint
CREATE TABLE `user_class_progress` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`base_class_key` text,
	`t2_path_key` text,
	`t3_spec_key` text,
	`quiz_recommendation` text,
	`reset_count` integer DEFAULT 0 NOT NULL,
	`selected_at` integer,
	`advanced_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_gear_equips` (
	`user_id` integer NOT NULL,
	`slot` text NOT NULL,
	`gear_instance_id` integer,
	`equipped_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gear_instance_id`) REFERENCES `gear_instances`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_gear_equips_gear_unique` ON `user_gear_equips` (`gear_instance_id`);