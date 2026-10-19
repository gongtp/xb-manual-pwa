CREATE TABLE `quest_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`is_built_in` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_labels_game_name_unique` ON `quest_labels` (`game`,`name`);--> statement-breakpoint
ALTER TABLE `quests` ADD `marker_id` text DEFAULT '' NOT NULL;