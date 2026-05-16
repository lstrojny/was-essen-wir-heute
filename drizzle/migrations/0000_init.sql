CREATE TABLE `central_ingredient_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`central_ingredient_id` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`central_ingredient_id`) REFERENCES `central_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `central_ingredient_aliases_entry_alias_unique` ON `central_ingredient_aliases` (`central_ingredient_id`,lower("alias"));--> statement-breakpoint
CREATE INDEX `central_ingredient_aliases_alias_idx` ON `central_ingredient_aliases` (lower("alias"));--> statement-breakpoint
CREATE TABLE `central_ingredient_count_units` (
	`id` text PRIMARY KEY NOT NULL,
	`central_ingredient_id` text NOT NULL,
	`unit` text NOT NULL,
	`grams_per_unit` real NOT NULL,
	FOREIGN KEY (`central_ingredient_id`) REFERENCES `central_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `central_ingredient_count_units_entry_unit_unique` ON `central_ingredient_count_units` (`central_ingredient_id`,lower("unit"));--> statement-breakpoint
CREATE TABLE `central_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_de` text,
	`canonical_en` text,
	`role` text NOT NULL,
	`density` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`language` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);