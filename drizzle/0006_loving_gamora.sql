CREATE TABLE `xc1_location_progress` (
	`location_id` text PRIMARY KEY NOT NULL,
	`visited` integer DEFAULT false NOT NULL,
	`bookmarked` integer DEFAULT false NOT NULL
);
