CREATE TABLE `wiki_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_by_user_id` integer,
	`updated_by_user_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_pages_slug_unique` ON `wiki_pages` (`slug`);--> statement-breakpoint
CREATE INDEX `wiki_pages_title_idx` ON `wiki_pages` (`title`);--> statement-breakpoint
CREATE INDEX `wiki_pages_updated_idx` ON `wiki_pages` (`updated_at`);--> statement-breakpoint
ALTER TABLE `fish_catches` ADD `caught_name` text;