CREATE TABLE `meal_plan_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_window_start` text NOT NULL,
	`active_window_end` text NOT NULL,
	`recent_window_weeks` integer DEFAULT 4 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`recipe_id` text,
	`state` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `meal_plan_entries_cleared_iff_no_recipe` CHECK (
		(`state` = 'cleared' AND `recipe_id` IS NULL)
		OR (`state` <> 'cleared' AND `recipe_id` IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_entries_date_unique` ON `meal_plan_entries` (`date`);--> statement-breakpoint
CREATE INDEX `meal_plan_entries_recipe_id_idx` ON `meal_plan_entries` (`recipe_id`);--> statement-breakpoint
INSERT INTO `meal_plan_settings` (`id`, `active_window_start`, `active_window_end`, `recent_window_weeks`)
VALUES (1, date('now', '+1 day'), date('now', '+7 day'), 4);
