CREATE TABLE `cuisines` (
	`key` text PRIMARY KEY NOT NULL,
	`label_de` text NOT NULL,
	`label_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_components` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_recipe_id` text NOT NULL,
	`child_recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`parent_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_components_parent_position_unique` ON `recipe_components` (`parent_recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`amount` real,
	`unit` text,
	`name` text NOT NULL,
	`central_ingredient_id` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`central_ingredient_id`) REFERENCES `central_ingredients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_ingredients_recipe_position_unique` ON `recipe_ingredients` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_ratings_recipe_user_unique` ON `recipe_ratings` (`recipe_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`text_de` text,
	`text_en` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_steps_recipe_position_unique` ON `recipe_steps` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title_de` text,
	`title_en` text,
	`notes_de` text,
	`notes_en` text,
	`cuisine_key` text NOT NULL,
	`active_time_minutes` integer NOT NULL,
	`wait_time_minutes` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`source_identifier` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`cuisine_key`) REFERENCES `cuisines`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recipes_cuisine_idx` ON `recipes` (`cuisine_key`);--> statement-breakpoint
INSERT INTO `cuisines` (`key`, `label_de`, `label_en`) VALUES
    ('italian', 'Italienisch', 'Italian'),
    ('thai', 'Thailändisch', 'Thai'),
    ('german', 'Deutsch', 'German'),
    ('french', 'Französisch', 'French'),
    ('mexican', 'Mexikanisch', 'Mexican'),
    ('indian', 'Indisch', 'Indian'),
    ('american', 'Amerikanisch', 'American'),
    ('mediterranean', 'Mediterran', 'Mediterranean'),
    ('japanese', 'Japanisch', 'Japanese'),
    ('chinese', 'Chinesisch', 'Chinese'),
    ('greek', 'Griechisch', 'Greek'),
    ('spanish', 'Spanisch', 'Spanish'),
    ('middle-eastern', 'Nahöstlich', 'Middle-Eastern'),
    ('vietnamese', 'Vietnamesisch', 'Vietnamese'),
    ('other', 'Andere', 'Other');