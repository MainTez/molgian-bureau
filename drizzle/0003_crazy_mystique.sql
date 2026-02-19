CREATE TABLE `fish_hall_of_fame` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`catch_id` integer NOT NULL,
	`fish_key` text NOT NULL,
	`fish_name` text NOT NULL,
	`rarity` text NOT NULL,
	`channel_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catch_id`) REFERENCES `fish_catches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fish_hof_rarity_idx` ON `fish_hall_of_fame` (`rarity`);--> statement-breakpoint
CREATE INDEX `fish_hof_recorded_idx` ON `fish_hall_of_fame` (`recorded_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `fish_hof_catch_unique` ON `fish_hall_of_fame` (`catch_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`username` text NOT NULL,
	`salary_base` integer DEFAULT 150 NOT NULL,
	`last_work_at` integer,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`lifetime_eggs_hatched` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_salary_base_positive" CHECK("__new_users"."salary_base" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "discord_id", "username", "salary_base", "last_work_at", "xp", "level", "lifetime_eggs_hatched", "created_at", "updated_at") SELECT "id", "discord_id", "username", CASE WHEN "salary_base" < 150 THEN 150 ELSE "salary_base" END, "last_work_at", "xp", "level", "lifetime_eggs_hatched", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);
