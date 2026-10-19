CREATE TABLE `xc1_npc_appearances` (
	`npc_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`active_time` text DEFAULT '' NOT NULL,
	`condition` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`npc_id`, `sort_order`),
	FOREIGN KEY (`npc_id`) REFERENCES `xc1_npcs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `xc1_npc_appearances_region_idx` ON `xc1_npc_appearances` (`region`);--> statement-breakpoint
CREATE TABLE `xc1_npc_quests` (
	`npc_id` text NOT NULL,
	`quest_id` text NOT NULL,
	`relation` text DEFAULT 'giver' NOT NULL,
	PRIMARY KEY(`npc_id`, `quest_id`, `relation`),
	FOREIGN KEY (`npc_id`) REFERENCES `xc1_npcs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `xc1_npc_quests_quest_idx` ON `xc1_npc_quests` (`quest_id`);--> statement-breakpoint
CREATE TABLE `xc1_npcs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`arc` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `xc1_npcs_name_idx` ON `xc1_npcs` (`name`);--> statement-breakpoint
CREATE INDEX `xc1_npcs_arc_idx` ON `xc1_npcs` (`arc`);