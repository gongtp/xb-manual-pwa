import { index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const quests = sqliteTable("quests", {
  id: text("id").primaryKey(),
  game: text("game").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  chapter: text("chapter").notNull().default(""),
  region: text("region").notNull().default(""),
  giver: text("giver").notNull().default(""),
  reward: text("reward").notNull().default(""),
  prerequisites: text("prerequisites").notNull().default(""),
  source: text("source").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  status: text("status").notNull().default("incomplete"),
  markerId: text("marker_id").notNull().default(""),
  isTimed: integer("is_timed", { mode: "boolean" }).notNull().default(false),
  isExclusive: integer("is_exclusive", { mode: "boolean" }).notNull().default(false),
  exclusiveGroup: text("exclusive_group").notNull().default(""),
  exclusiveRoute: text("exclusive_route").notNull().default(""),
  manualNotes: text("manual_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const questLabels = sqliteTable("quest_labels", {
  id: text("id").primaryKey(),
  game: text("game").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("quest_labels_game_name_unique").on(table.game, table.name),
]);

export const gameNotes = sqliteTable("game_notes", {
  id: text("id").primaryKey(),
  game: text("game").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("其他"),
  content: text("content").notNull().default(""),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const xc1Npcs = sqliteTable("xc1_npcs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  arc: text("arc").notNull(),
  source: text("source").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("xc1_npcs_name_idx").on(table.name),
  index("xc1_npcs_arc_idx").on(table.arc),
]);

export const xc1NpcAppearances = sqliteTable("xc1_npc_appearances", {
  npcId: text("npc_id").notNull().references(() => xc1Npcs.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  region: text("region").notNull().default(""),
  location: text("location").notNull().default(""),
  activeTime: text("active_time").notNull().default(""),
  condition: text("condition").notNull().default(""),
}, (table) => [
  primaryKey({ columns: [table.npcId, table.sortOrder] }),
  index("xc1_npc_appearances_region_idx").on(table.region),
]);

export const xc1NpcQuests = sqliteTable("xc1_npc_quests", {
  npcId: text("npc_id").notNull().references(() => xc1Npcs.id, { onDelete: "cascade" }),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  relation: text("relation").notNull().default("giver"),
}, (table) => [
  primaryKey({ columns: [table.npcId, table.questId, table.relation] }),
  index("xc1_npc_quests_quest_idx").on(table.questId),
]);

export const xc1LocationProgress = sqliteTable("xc1_location_progress", {
  locationId: text("location_id").primaryKey().notNull(),
  visited: integer("visited", { mode: "boolean" }).notNull().default(false),
  bookmarked: integer("bookmarked", { mode: "boolean" }).notNull().default(false),
});

export const xc2CharacterProgress = sqliteTable("xc2_character_progress", {
  characterId: text("character_id").primaryKey().notNull(),
  collected: integer("collected", { mode: "boolean" }).notNull().default(false),
  bookmarked: integer("bookmarked", { mode: "boolean" }).notNull().default(false),
});

export const xc2LocationProgress = sqliteTable("xc2_location_progress", {
  locationId: text("location_id").primaryKey().notNull(),
  visited: integer("visited", { mode: "boolean" }).notNull().default(false),
  bookmarked: integer("bookmarked", { mode: "boolean" }).notNull().default(false),
});
