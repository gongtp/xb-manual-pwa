ALTER TABLE `quests` ADD `is_timed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quests` ADD `is_exclusive` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quests` ADD `exclusive_group` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quests` ADD `exclusive_route` text DEFAULT '' NOT NULL;