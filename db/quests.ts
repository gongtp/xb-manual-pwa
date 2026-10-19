import xc1QuestData from "../data/xc1-quests.json";
import xc1GiverCorrections from "../data/xc1-giver-corrections.json";
import xc2QuestData from "../data/xc2-quests.json";
import xc3QuestData from "../data/xc3-quests.json";
import xcxQuestData from "../data/xcx-quests.json";
import { getSqlite, type SqlitePreparedStatement } from ".";
import { isGameCode, isQualityStatus, type Quest } from "../lib/quest";
import { ensureQuestLabelDatabase, getQuestLabel } from "./quest-labels";

type QuestRow = Omit<Quest, "sourceUrl" | "markerId" | "isTimed" | "isExclusive" | "exclusiveGroup" | "exclusiveRoute" | "manualNotes" | "updatedAt"> & {
  source_url: string;
  marker_id: string;
  is_timed: number;
  is_exclusive: number;
  exclusive_group: string;
  exclusive_route: string;
  manual_notes: string;
  updated_at: string;
};

type LegacyMetadata = Pick<Quest, "isTimed" | "isExclusive" | "exclusiveGroup" | "exclusiveRoute">;

function getLegacyNoteValue(notes: string, label: string) {
  const prefix = `${label}：`;
  return notes
    .split("；")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? "";
}

function legacyMetadataFromNotes(notes: string): LegacyMetadata {
  const exclusiveGroup = getLegacyNoteValue(notes, "互斥组");
  return {
    isTimed: getLegacyNoteValue(notes, "限时") === "是",
    isExclusive: Boolean(exclusiveGroup),
    exclusiveGroup,
    exclusiveRoute: getLegacyNoteValue(notes, "路线"),
  };
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "是"].includes(normalized)) return true;
    if (["false", "0", "no", "否"].includes(normalized)) return false;
  }
  return fallback;
}

const createTableSql = `CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('XC1', 'XC2', 'XC3', 'XCX')),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  chapter TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  giver TEXT NOT NULL DEFAULT '',
  reward TEXT NOT NULL DEFAULT '',
  prerequisites TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('complete', 'incomplete', 'pending', 'conflict')),
  marker_id TEXT NOT NULL DEFAULT '',
  is_timed INTEGER NOT NULL DEFAULT 0 CHECK (is_timed IN (0, 1)),
  is_exclusive INTEGER NOT NULL DEFAULT 0 CHECK (is_exclusive IN (0, 1)),
  exclusive_group TEXT NOT NULL DEFAULT '',
  exclusive_route TEXT NOT NULL DEFAULT '',
  manual_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
)`;

const indexStatements = [
  "CREATE INDEX IF NOT EXISTS quests_game_idx ON quests(game)",
  "CREATE INDEX IF NOT EXISTS quests_type_idx ON quests(type)",
  "CREATE INDEX IF NOT EXISTS quests_status_idx ON quests(status)",
  "CREATE INDEX IF NOT EXISTS quests_region_idx ON quests(region)",
];

const additionalColumns = [
  { name: "is_timed", sql: "ALTER TABLE quests ADD COLUMN is_timed INTEGER NOT NULL DEFAULT 0 CHECK (is_timed IN (0, 1))" },
  { name: "is_exclusive", sql: "ALTER TABLE quests ADD COLUMN is_exclusive INTEGER NOT NULL DEFAULT 0 CHECK (is_exclusive IN (0, 1))" },
  { name: "exclusive_group", sql: "ALTER TABLE quests ADD COLUMN exclusive_group TEXT NOT NULL DEFAULT ''" },
  { name: "exclusive_route", sql: "ALTER TABLE quests ADD COLUMN exclusive_route TEXT NOT NULL DEFAULT ''" },
  { name: "manual_notes", sql: "ALTER TABLE quests ADD COLUMN manual_notes TEXT NOT NULL DEFAULT ''" },
  { name: "marker_id", sql: "ALTER TABLE quests ADD COLUMN marker_id TEXT NOT NULL DEFAULT ''" },
] as const;

const upsertSql = `
  INSERT INTO quests (
    id, game, name, type, chapter, region, giver, reward,
    prerequisites, source, source_url, status, marker_id, is_timed, is_exclusive,
    exclusive_group, exclusive_route, manual_notes, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    game = excluded.game,
    name = excluded.name,
    type = excluded.type,
    chapter = excluded.chapter,
    region = excluded.region,
    giver = excluded.giver,
    reward = excluded.reward,
    prerequisites = excluded.prerequisites,
    source = excluded.source,
    source_url = excluded.source_url,
    status = excluded.status,
    marker_id = excluded.marker_id,
    is_timed = excluded.is_timed,
    is_exclusive = excluded.is_exclusive,
    exclusive_group = excluded.exclusive_group,
    exclusive_route = excluded.exclusive_route,
    manual_notes = excluded.manual_notes,
    notes = excluded.notes,
    updated_at = excluded.updated_at
`;

function rowToQuest(row: QuestRow): Quest {
  return {
    id: row.id,
    game: row.game,
    name: row.name,
    type: row.type,
    chapter: row.chapter,
    region: row.region,
    giver: row.giver,
    reward: row.reward,
    prerequisites: row.prerequisites,
    source: row.source,
    sourceUrl: row.source_url,
    status: row.status,
    markerId: row.marker_id,
    isTimed: Boolean(row.is_timed),
    isExclusive: Boolean(row.is_exclusive),
    exclusiveGroup: row.exclusive_group,
    exclusiveRoute: row.exclusive_route,
    manualNotes: row.manual_notes,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export function normalizeQuest(value: unknown): Quest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  const name = String(record.name ?? "").trim();
  const game = record.game;
  const status = record.status;
  if (!id || !name || !isGameCode(game) || !isQualityStatus(status)) return null;
  const supportsRiskFlags = game === "XC1" || game === "XCX";
  const notes = String(record.notes ?? "").trim();
  const legacy = legacyMetadataFromNotes(notes);
  const exclusiveGroup = supportsRiskFlags
    ? String(record.exclusiveGroup ?? record.exclusive_group ?? legacy.exclusiveGroup).trim()
    : "";
  const exclusiveRoute = supportsRiskFlags
    ? String(record.exclusiveRoute ?? record.exclusive_route ?? legacy.exclusiveRoute).trim()
    : "";

  return {
    id,
    game,
    name,
    type: String(record.type ?? "").trim(),
    chapter: String(record.chapter ?? "").trim(),
    region: String(record.region ?? "").trim(),
    giver: String(record.giver ?? "").trim(),
    reward: String(record.reward ?? "").trim(),
    prerequisites: String(record.prerequisites ?? "").trim(),
    source: String(record.source ?? "").trim(),
    sourceUrl: String(record.sourceUrl ?? "").trim(),
    status,
    markerId: String(record.markerId ?? record.marker_id ?? "").trim(),
    isTimed: supportsRiskFlags && normalizeBoolean(record.isTimed ?? record.is_timed, legacy.isTimed),
    isExclusive: supportsRiskFlags && normalizeBoolean(record.isExclusive ?? record.is_exclusive, legacy.isExclusive || Boolean(exclusiveGroup)),
    exclusiveGroup,
    exclusiveRoute,
    manualNotes: String(record.manualNotes ?? record.manual_notes ?? "").trim(),
    notes,
    updatedAt: String(record.updatedAt ?? new Date().toISOString().slice(0, 10)).trim(),
  };
}

function bindQuest(statement: SqlitePreparedStatement, quest: Quest) {
  return statement.bind(
    quest.id,
    quest.game,
    quest.name,
    quest.type,
    quest.chapter,
    quest.region,
    quest.giver,
    quest.reward,
    quest.prerequisites,
    quest.source,
    quest.sourceUrl,
    quest.status,
    quest.markerId,
    quest.isTimed ? 1 : 0,
    quest.isExclusive ? 1 : 0,
    quest.exclusiveGroup,
    quest.exclusiveRoute,
    quest.manualNotes,
    quest.notes,
    quest.updatedAt,
  );
}

const seedQuests = ([...xc1QuestData, ...xc2QuestData, ...xc3QuestData, ...xcxQuestData] as unknown[])
  .map(normalizeQuest)
  .filter((quest): quest is Quest => Boolean(quest));

async function ensureQuestColumns() {
  const database = getSqlite();
  const tableInfo = await database.prepare("PRAGMA table_info(quests)").all<{ name: string }>();
  const columns = new Set(tableInfo.results.map((column) => column.name));
  const missing = additionalColumns.filter((column) => !columns.has(column.name));
  if (!missing.length) return;
  const shouldBackfillLegacyMetadata = missing.some((column) => [
    "is_timed", "is_exclusive", "exclusive_group", "exclusive_route",
  ].includes(column.name));

  for (const column of missing) await database.prepare(column.sql).run();
  if (!shouldBackfillLegacyMetadata) return;

  const legacyRows = await database.prepare("SELECT id, notes FROM quests").all<{ id: string; notes: string }>();
  for (let offset = 0; offset < legacyRows.results.length; offset += 50) {
    const chunk = legacyRows.results.slice(offset, offset + 50);
    await database.batch(chunk.map((row) => {
      const metadata = legacyMetadataFromNotes(row.notes);
      return database.prepare(`UPDATE quests SET
        is_timed = ?, is_exclusive = ?, exclusive_group = ?, exclusive_route = ?
        WHERE id = ?`)
        .bind(
          metadata.isTimed ? 1 : 0,
          metadata.isExclusive ? 1 : 0,
          metadata.exclusiveGroup,
          metadata.exclusiveRoute,
          row.id,
        );
    }));
  }
}

async function writeInChunks(quests: Quest[]) {
  const database = getSqlite();
  const statement = database.prepare(upsertSql);
  for (let offset = 0; offset < quests.length; offset += 50) {
    const chunk = quests.slice(offset, offset + 50);
    await database.batch(chunk.map((quest) => bindQuest(statement, quest)));
  }
}

async function removeStaleGeneratedSeeds() {
  const database = getSqlite();
  const currentSeedIds = new Set(seedQuests.map((quest) => quest.id));
  const generated = await database.prepare(`SELECT id FROM quests
    WHERE (game = 'XC2' AND source LIKE '%乐园数据管理室%')
      OR (game = 'XC3' AND source LIKE '%送行者的收集手册%')`).all<{ id: string }>();
  const staleIds = generated.results.map((row) => row.id).filter((id) => !currentSeedIds.has(id));
  for (let offset = 0; offset < staleIds.length; offset += 50) {
    const chunk = staleIds.slice(offset, offset + 50);
    await database.batch(chunk.map((id) => database.prepare("DELETE FROM quests WHERE id = ?").bind(id)));
  }
}

async function migrateLegacyXC2NotesToMarkdown() {
  const database = getSqlite();
  const generatedXC2 = seedQuests.filter((quest) => quest.game === "XC2" && quest.notes.startsWith("## "));
  for (let offset = 0; offset < generatedXC2.length; offset += 50) {
    const chunk = generatedXC2.slice(offset, offset + 50);
    await database.batch(chunk.map((quest) => database.prepare(`UPDATE quests
      SET notes = ?, updated_at = ?
      WHERE id = ? AND game = 'XC2' AND source LIKE '%乐园数据管理室%'
        AND (notes NOT LIKE '## %'
          OR notes LIKE '%wikitable%'
          OR notes LIKE '%；===%'
          OR notes LIKE '%640px%'
          OR notes LIKE '%480px%'
          OR notes LIKE '%360px%'
          OR notes LIKE '%800px%'
          OR notes LIKE '%缩略图%'
          OR notes LIKE '%]]%')`).bind(quest.notes, quest.updatedAt, quest.id)));
  }
}

async function migrateXC1QuestGivers() {
  const database = getSqlite();
  await database.prepare(`CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
  )`).run();
  const key = "xc1_giver_corrections_2026_10_01";
  const marker = await database.prepare("SELECT value FROM app_metadata WHERE key = ?")
    .bind(key).first<{ value: string }>();
  if (marker?.value === "applied") return;
  const statements = xc1GiverCorrections.quests.map((correction) => {
    const expectedGivers = [...correction.legacyGivers, correction.giver];
    const placeholders = expectedGivers.map(() => "?").join(", ");
    return database.prepare(`UPDATE quests SET
      giver = ?,
      notes = CASE WHEN instr(notes, ?) > 0 THEN notes
        WHEN notes = '' THEN ? ELSE notes || '；' || ? END,
      updated_at = ?
      WHERE id = ? AND game = 'XC1' AND name = ? AND giver IN (${placeholders})`)
      .bind(correction.giver, correction.notes, correction.notes, correction.notes,
        xc1GiverCorrections.updatedAt, correction.id, correction.name, ...expectedGivers);
  });
  statements.push(database.prepare("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, 'applied')")
    .bind(key));
  await database.batch(statements);
}

export async function ensureQuestDatabase() {
  const database = getSqlite();
  await database.prepare(createTableSql).run();
  await ensureQuestColumns();
  await database.prepare(`UPDATE quests SET
    is_timed = 0,
    is_exclusive = 0,
    exclusive_group = '',
    exclusive_route = ''
    WHERE game IN ('XC2', 'XC3')`).run();
  await database.batch(indexStatements.map((sql) => database.prepare(sql)));
  await removeStaleGeneratedSeeds();
  await migrateLegacyXC2NotesToMarkdown();
  const existing = await database.prepare("SELECT id FROM quests").all<{ id: string }>();
  const existingIds = new Set(existing.results.map((row) => row.id));
  const missingSeeds = seedQuests.filter((quest) => !existingIds.has(quest.id));
  if (missingSeeds.length) await writeInChunks(missingSeeds);
  await migrateXC1QuestGivers();
}

export async function listQuests() {
  await ensureQuestDatabase();
  const result = await getSqlite()
    .prepare("SELECT * FROM quests ORDER BY CASE game WHEN 'XC1' THEN 1 WHEN 'XC2' THEN 2 WHEN 'XC3' THEN 3 ELSE 4 END, id")
    .all<QuestRow>();
  return result.results.map(rowToQuest);
}

export async function setQuestMarker(questIdValue: unknown, markerIdValue: unknown) {
  await ensureQuestDatabase();
  await ensureQuestLabelDatabase();
  const questId = String(questIdValue ?? "").trim();
  const markerId = String(markerIdValue ?? "").trim();
  if (!questId) throw new Error("任务编号不能为空");

  const quest = await getSqlite().prepare("SELECT game FROM quests WHERE id = ?")
    .bind(questId)
    .first<{ game: string }>();
  if (!quest) throw new Error("任务不存在");

  if (markerId) {
    const label = await getQuestLabel(markerId);
    if (!label) throw new Error("选择的标签不存在");
    if (label.game !== quest.game) throw new Error("标签与任务不属于同一游戏");
  }

  await getSqlite().prepare("UPDATE quests SET marker_id = ? WHERE id = ?").bind(markerId, questId).run();
  const updated = await getSqlite().prepare("SELECT * FROM quests WHERE id = ?").bind(questId).first<QuestRow>();
  if (!updated) throw new Error("更新任务标记失败");
  return rowToQuest(updated);
}

function exclusiveGroupForPair(leftId: string, rightId: string) {
  return `AUTO:${[leftId, rightId].sort().join("|")}`;
}

const clearExclusiveGroupSql = `UPDATE quests SET
  is_exclusive = 0, exclusive_group = '', exclusive_route = ''
  WHERE exclusive_group = ?`;

export async function saveQuest(quest: Quest, originalId?: string | null, exclusivePeerId?: string | null) {
  await ensureQuestDatabase();
  const database = getSqlite();
  const oldId = originalId?.trim();
  const currentId = oldId || quest.id;
  const current = await database.prepare("SELECT id, exclusive_group FROM quests WHERE id = ?")
    .bind(currentId)
    .first<{ id: string; exclusive_group: string }>();

  if (oldId && oldId !== quest.id) {
    const duplicate = await database.prepare("SELECT id FROM quests WHERE id = ?").bind(quest.id).first();
    if (duplicate) throw new Error("任务编号已经存在，请换一个编号");
  }

  const peerId = exclusivePeerId?.trim() ?? "";
  if (quest.isExclusive && (!peerId || peerId === currentId || peerId === quest.id)) {
    throw new Error("请选择一个不同的互斥任务");
  }

  const statements: SqlitePreparedStatement[] = [];
  const groupsToClear = new Set<string>();
  if (current?.exclusive_group) groupsToClear.add(current.exclusive_group);

  let savedQuest: Quest;
  if (quest.isExclusive) {
    const peer = await database.prepare("SELECT id, game, is_exclusive, exclusive_group FROM quests WHERE id = ?")
      .bind(peerId)
      .first<{ id: string; game: string; is_exclusive: number; exclusive_group: string }>();
    if (!peer) throw new Error("选择的互斥任务不存在");
    if (peer.game !== quest.game) throw new Error("互斥任务必须属于同一游戏");
    if (peer.is_exclusive && (!peer.exclusive_group || peer.exclusive_group !== current?.exclusive_group)) {
      throw new Error("选择的任务已经与其他任务互斥，请先解除原关系");
    }
    if (peer.exclusive_group) groupsToClear.add(peer.exclusive_group);

    const group = exclusiveGroupForPair(quest.id, peer.id);
    const orderedIds = [quest.id, peer.id].sort();
    savedQuest = {
      ...quest,
      isExclusive: true,
      exclusiveGroup: group,
      exclusiveRoute: orderedIds[0] === quest.id ? "A" : "B",
    };

    groupsToClear.forEach((oldGroup) => {
      statements.push(database.prepare(clearExclusiveGroupSql).bind(oldGroup));
    });
    if (oldId && oldId !== quest.id) {
      statements.push(database.prepare("DELETE FROM quests WHERE id = ?").bind(oldId));
    }
    statements.push(bindQuest(database.prepare(upsertSql), savedQuest));
    statements.push(database.prepare(`UPDATE quests SET
      is_exclusive = 1, exclusive_group = ?, exclusive_route = ?
      WHERE id = ?`)
      .bind(group, orderedIds[0] === peer.id ? "A" : "B", peer.id));
  } else {
    savedQuest = {
      ...quest,
      isExclusive: false,
      exclusiveGroup: "",
      exclusiveRoute: "",
    };
    groupsToClear.forEach((oldGroup) => {
      statements.push(database.prepare(clearExclusiveGroupSql).bind(oldGroup));
    });
    if (oldId && oldId !== quest.id) {
      statements.push(database.prepare("DELETE FROM quests WHERE id = ?").bind(oldId));
    }
    statements.push(bindQuest(database.prepare(upsertSql), savedQuest));
  }

  await database.batch(statements);
  return savedQuest;
}

export async function importQuests(values: unknown[]) {
  await ensureQuestDatabase();
  const normalized = values.map(normalizeQuest).filter((quest): quest is Quest => Boolean(quest));
  const existing = await getSqlite().prepare("SELECT id FROM quests").all<{ id: string }>();
  const existingIds = new Set(existing.results.map((row) => row.id));
  const seen = new Set<string>();
  const records: Quest[] = [];
  let added = 0;
  let updated = 0;
  let skipped = values.length - normalized.length;

  for (const quest of normalized) {
    if (seen.has(quest.id)) {
      skipped += 1;
      continue;
    }
    seen.add(quest.id);
    records.push(quest);
    if (existingIds.has(quest.id)) updated += 1;
    else added += 1;
  }

  await writeInChunks(records);
  return { added, updated, skipped, records };
}

export async function resetQuests() {
  await ensureQuestDatabase();
  await getSqlite().prepare("DELETE FROM quests").run();
  await writeInChunks(seedQuests);
  return listQuests();
}
