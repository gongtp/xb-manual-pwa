CREATE TABLE `game_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '其他' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
