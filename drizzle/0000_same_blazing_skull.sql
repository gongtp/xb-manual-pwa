CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`chapter` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`giver` text DEFAULT '' NOT NULL,
	`reward` text DEFAULT '' NOT NULL,
	`prerequisites` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
