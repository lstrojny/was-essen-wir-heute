CREATE TABLE `spoonacular_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`response_json` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spoonacular_quota` (
	`id` integer PRIMARY KEY NOT NULL,
	`quota_used` real,
	`quota_left` real,
	`quota_request` real,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
