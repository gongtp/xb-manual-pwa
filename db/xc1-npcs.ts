import npcSeedData from "../data/xc1-npcs.json";
import { isXC1NpcArc, type XC1Npc, type XC1NpcAppearance } from "../lib/xc1-npc";
import { getSqlite, type SqlitePreparedStatement } from ".";
import { ensureQuestDatabase } from "./quests";

type Xc1NpcRow = Omit<XC1Npc, "appearances" | "questIds" | "sourceUrl" | "updatedAt"> & {
  source_url: string;
  updated_at: string;
};

type Xc1NpcAppearanceRow = XC1NpcAppearance & {
  npc_id: string;
  sort_order: number;
  active_time: string;
};

type Xc1NpcQuestRow = {
  npc_id: string;
  quest_id: string;
};

const seedVersion = "2026-10-01-v3";

const createStatements = [
  `CREATE TABLE IF NOT EXISTS xc1_npcs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    arc TEXT NOT NULL CHECK (arc IN ('main', 'futureConnected')),
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS xc1_npc_appearances (
    npc_id TEXT NOT NULL REFERENCES xc1_npcs(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    active_time TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (npc_id, sort_order)
  )`,
  `CREATE TABLE IF NOT EXISTS xc1_npc_quests (
    npc_id TEXT NOT NULL REFERENCES xc1_npcs(id) ON DELETE CASCADE,
    quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'giver',
    PRIMARY KEY (npc_id, quest_id, relation)
  )`,
  "CREATE INDEX IF NOT EXISTS xc1_npcs_name_idx ON xc1_npcs(name)",
  "CREATE INDEX IF NOT EXISTS xc1_npcs_arc_idx ON xc1_npcs(arc)",
  "CREATE INDEX IF NOT EXISTS xc1_npc_appearances_region_idx ON xc1_npc_appearances(region)",
  "CREATE INDEX IF NOT EXISTS xc1_npc_quests_quest_idx ON xc1_npc_quests(quest_id)",
  `CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
];

function normalizeAppearance(value: unknown): XC1NpcAppearance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const region = String(record.region ?? "").trim();
  const location = String(record.location ?? "").trim();
  const activeTime = String(record.activeTime ?? "").trim();
  if (!region || !location || !activeTime) return null;
  return {
    region,
    location,
    activeTime,
    condition: String(record.condition ?? "").trim(),
  };
}

export function normalizeXC1Npc(value: unknown): XC1Npc | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  const name = String(record.name ?? "").trim();
  const arc = record.arc;
  const appearances = Array.isArray(record.appearances)
    ? record.appearances.map(normalizeAppearance).filter((item): item is XC1NpcAppearance => Boolean(item))
    : [];
  const questIds = Array.isArray(record.questIds)
    ? [...new Set(record.questIds.map((questId) => String(questId).trim()).filter(Boolean))]
    : [];
  if (!id || !name || !isXC1NpcArc(arc) || !appearances.length || !questIds.length) return null;
  return {
    id,
    name,
    arc,
    appearances,
    questIds,
    source: String(record.source ?? "").trim(),
    sourceUrl: String(record.sourceUrl ?? "").trim(),
    notes: String(record.notes ?? "").trim(),
    updatedAt: String(record.updatedAt ?? "").trim(),
  };
}

const seedNpcs = (npcSeedData as unknown[])
  .map(normalizeXC1Npc)
  .filter((npc): npc is XC1Npc => Boolean(npc));
const seedAppearanceCount = seedNpcs.reduce((count, npc) => count + npc.appearances.length, 0);
const seedLinkCount = seedNpcs.reduce((count, npc) => count + npc.questIds.length, 0);

function seedStatements(): SqlitePreparedStatement[] {
  const database = getSqlite();
  const statements: SqlitePreparedStatement[] = [
    database.prepare("DELETE FROM xc1_npc_quests"),
    database.prepare("DELETE FROM xc1_npc_appearances"),
    database.prepare("DELETE FROM xc1_npcs"),
  ];
  const insertNpc = database.prepare(`INSERT INTO xc1_npcs (
    id, name, arc, source, source_url, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertAppearance = database.prepare(`INSERT INTO xc1_npc_appearances (
    npc_id, sort_order, region, location, active_time, condition
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertQuest = database.prepare(`INSERT INTO xc1_npc_quests (
    npc_id, quest_id, relation
  ) VALUES (?, ?, 'giver')`);

  seedNpcs.forEach((npc) => {
    statements.push(insertNpc.bind(
      npc.id, npc.name, npc.arc, npc.source, npc.sourceUrl, npc.notes, npc.updatedAt,
    ));
    npc.appearances.forEach((appearance, sortOrder) => statements.push(insertAppearance.bind(
      npc.id,
      sortOrder,
      appearance.region,
      appearance.location,
      appearance.activeTime,
      appearance.condition,
    )));
    npc.questIds.forEach((questId) => statements.push(insertQuest.bind(npc.id, questId)));
  });
  statements.push(getSqlite().prepare(
    "INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('xc1_npc_seed_version', ?)",
  ).bind(seedVersion));
  return statements;
}

export async function ensureXc1NpcDatabase() {
  await ensureQuestDatabase();
  const database = getSqlite();
  for (const sql of createStatements) await database.prepare(sql).run();
  const [marker, npcCount, appearanceCount, linkCount] = await Promise.all([
    database.prepare("SELECT value FROM app_metadata WHERE key = 'xc1_npc_seed_version'").first<{ value: string }>(),
    database.prepare("SELECT COUNT(*) AS count FROM xc1_npcs").first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM xc1_npc_appearances").first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM xc1_npc_quests").first<{ count: number }>(),
  ]);
  const current = marker?.value === seedVersion
    && Number(npcCount?.count) === seedNpcs.length
    && Number(appearanceCount?.count) === seedAppearanceCount
    && Number(linkCount?.count) === seedLinkCount;
  if (!current) await database.batch(seedStatements());
}

export async function listXc1Npcs(): Promise<XC1Npc[]> {
  await ensureXc1NpcDatabase();
  const database = getSqlite();
  const [npcs, appearances, questLinks] = await Promise.all([
    database.prepare(`SELECT * FROM xc1_npcs
      ORDER BY CASE arc WHEN 'main' THEN 1 ELSE 2 END, id`).all<Xc1NpcRow>(),
    database.prepare("SELECT * FROM xc1_npc_appearances ORDER BY npc_id, sort_order").all<Xc1NpcAppearanceRow>(),
    database.prepare("SELECT npc_id, quest_id FROM xc1_npc_quests WHERE relation = 'giver' ORDER BY npc_id, quest_id").all<Xc1NpcQuestRow>(),
  ]);
  const appearancesByNpc = new Map<string, XC1NpcAppearance[]>();
  appearances.results.forEach((row) => appearancesByNpc.set(row.npc_id, [
    ...(appearancesByNpc.get(row.npc_id) ?? []),
    {
      region: row.region,
      location: row.location,
      activeTime: row.active_time,
      condition: row.condition,
    },
  ]));
  const questIdsByNpc = new Map<string, string[]>();
  questLinks.results.forEach((row) => questIdsByNpc.set(row.npc_id, [
    ...(questIdsByNpc.get(row.npc_id) ?? []),
    row.quest_id,
  ]));
  return npcs.results.map((row) => ({
    id: row.id,
    name: row.name,
    arc: row.arc,
    appearances: appearancesByNpc.get(row.id) ?? [],
    questIds: questIdsByNpc.get(row.id) ?? [],
    source: row.source,
    sourceUrl: row.source_url,
    notes: row.notes,
    updatedAt: row.updated_at,
  }));
}
