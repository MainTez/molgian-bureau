UPDATE `users`
SET `salary_base` = 150,
    `updated_at` = (CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
DELETE FROM `raises_owned`;
