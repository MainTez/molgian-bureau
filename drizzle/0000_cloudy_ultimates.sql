CREATE TABLE `active_pet` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`pet_instance_id` integer,
	`equipped_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pet_instance_id`) REFERENCES `pet_instances`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "balances_non_negative" CHECK("balances"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `cosmetics_owned` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`slot` text NOT NULL,
	`cosmetic_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cosmetics_owned_user_slot_cosmetic` ON `cosmetics_owned` (`user_id`,`slot`,`cosmetic_id`);--> statement-breakpoint
CREATE TABLE `daily_shop_rotation` (
	`day_key` text PRIMARY KEY NOT NULL,
	`item_ids_json` text NOT NULL,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_shop_rotation_generated_idx` ON `daily_shop_rotation` (`generated_at`);--> statement-breakpoint
CREATE TABLE `eggs_inventory` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`eggs` integer DEFAULT 0 NOT NULL,
	`mythic_eggs` integer DEFAULT 0 NOT NULL,
	`last_win_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "eggs_inventory_non_negative" CHECK("eggs_inventory"."eggs" >= 0),
	CONSTRAINT "mythic_eggs_inventory_non_negative" CHECK("eggs_inventory"."mythic_eggs" >= 0)
);
--> statement-breakpoint
CREATE TABLE `event_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`winner_user_id` integer,
	`details_json` text,
	FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_runs_type_idx` ON `event_runs` (`event_type`);--> statement-breakpoint
CREATE INDEX `event_runs_started_idx` ON `event_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `fish_catches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`fish_key` text NOT NULL,
	`rarity` text NOT NULL,
	`season` text NOT NULL,
	`base_value` integer NOT NULL,
	`final_value` integer NOT NULL,
	`sold_at` integer,
	`caught_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fish_catches_user_idx` ON `fish_catches` (`user_id`);--> statement-breakpoint
CREATE INDEX `fish_catches_sold_idx` ON `fish_catches` (`sold_at`);--> statement-breakpoint
CREATE TABLE `fish_collection` (
	`user_id` integer NOT NULL,
	`fish_key` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`best_value` integer DEFAULT 0 NOT NULL,
	`first_caught_at` integer NOT NULL,
	`last_caught_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `fish_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jackpot_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`entered_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `jackpot_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jackpot_entries_round_idx` ON `jackpot_entries` (`round_id`);--> statement-breakpoint
CREATE INDEX `jackpot_entries_user_idx` ON `jackpot_entries` (`user_id`);--> statement-breakpoint
CREATE TABLE `jackpot_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`closed_at` integer,
	`winner_user_id` integer,
	`total_pool` integer DEFAULT 0 NOT NULL,
	`tax_collected` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `jackpot_rounds_status_idx` ON `jackpot_rounds` (`status`);--> statement-breakpoint
CREATE TABLE `loadout` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`title_id` text,
	`badge_id` text,
	`frame_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mythic_hall_of_fame` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pet_instance_id` integer NOT NULL,
	`pet_type` text NOT NULL,
	`rarity` text NOT NULL,
	`channel_id` text NOT NULL,
	`hatched_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pet_instance_id`) REFERENCES `pet_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mythic_hof_hatched_idx` ON `mythic_hall_of_fame` (`hatched_at`);--> statement-breakpoint
CREATE TABLE `pet_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pet_type` text NOT NULL,
	`rarity` text NOT NULL,
	`source_egg_type` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'kept' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pet_instances_user_idx` ON `pet_instances` (`user_id`);--> statement-breakpoint
CREATE INDEX `pet_instances_status_idx` ON `pet_instances` (`status`);--> statement-breakpoint
CREATE TABLE `pets_owned` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pet_type` text NOT NULL,
	`rarity` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`first_owned_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pets_owned_user_type_rarity` ON `pets_owned` (`user_id`,`pet_type`,`rarity`);--> statement-breakpoint
CREATE TABLE `raises_owned` (
	`user_id` integer NOT NULL,
	`raise_id` integer NOT NULL,
	`purchased_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `raise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rods_owned` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`tier` text NOT NULL,
	`equipped` integer DEFAULT 0 NOT NULL,
	`purchased_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rods_owned_user_tier_unique` ON `rods_owned` (`user_id`,`tier`);--> statement-breakpoint
CREATE TABLE `shards` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "shards_non_negative" CHECK("shards"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `treasury` (
	`id` integer PRIMARY KEY NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "treasury_non_negative" CHECK("treasury"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`username` text NOT NULL,
	`salary_base` integer DEFAULT 100 NOT NULL,
	`last_work_at` integer,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`lifetime_eggs_hatched` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_salary_base_positive" CHECK("users"."salary_base" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);