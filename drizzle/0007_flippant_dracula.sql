CREATE TABLE `xc2_character_progress` (
	`character_id` text PRIMARY KEY NOT NULL,
	`collected` integer DEFAULT false NOT NULL,
	`bookmarked` integer DEFAULT false NOT NULL
);
