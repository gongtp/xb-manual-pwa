/** Portable, versioned backup. Only these application tables may be restored. */
export const backupColumns = {
  quests: "id game name type chapter region giver reward prerequisites source source_url status marker_id is_timed is_exclusive exclusive_group exclusive_route manual_notes notes updated_at",
  quest_labels: "id game name color is_built_in sort_order created_at",
  game_notes: "id game title category content is_pinned sort_order created_at updated_at",
  xc1_npcs: "id name arc source source_url notes updated_at",
  xc1_npc_appearances: "npc_id sort_order region location active_time condition",
  xc1_npc_quests: "npc_id quest_id relation",
  xc1_location_progress: "location_id visited bookmarked",
  xc2_character_progress: "character_id collected bookmarked",
  xc2_location_progress: "location_id visited bookmarked",
  xc3_location_progress: "location_id visited bookmarked",
  app_metadata: "key value",
} as const;
export type BackupTable = keyof typeof backupColumns;
export type BackupRow = Record<string, string | number>;
export const backupTables = Object.keys(backupColumns) as BackupTable[];
export type ArchiveBackup = {
  format: "xeno-archive-backup";
  version: 1;
  exportedAt: string;
  tables: Record<BackupTable, BackupRow[]>;
};

export function validateBackup(value: unknown): ArchiveBackup {
  if (!value || typeof value !== "object") throw new Error("不是完整备份文件");
  let b = value as ArchiveBackup;
  if (b.format !== "xeno-archive-backup" || b.version !== 1 || !b.tables
    || typeof b.exportedAt !== "string") throw new Error("备份格式或版本不支持，请使用完整备份 JSON");
  // Backups made before XC3 locations have no records for the new directory.
  if (!Object.hasOwn(b.tables, "xc3_location_progress")) {
    b = { ...b, tables: { ...b.tables, xc3_location_progress: [] } };
  }
  if (Object.keys(b.tables).length !== backupTables.length) throw new Error("备份表不完整或包含未知表");
  for (const table of backupTables) {
    const rows = b.tables[table];
    const columns = backupColumns[table].split(" ");
    if (!Array.isArray(rows) || rows.length > 100_000) throw new Error(`备份表 ${table} 无效`);
    for (const row of rows) {
      if (!row || typeof row !== "object" || Object.keys(row).length !== columns.length
        || columns.some((key) => !Object.hasOwn(row, key)
          || !(typeof row[key] === "string" || (typeof row[key] === "number" && Number.isFinite(row[key]))))) {
        throw new Error(`备份表 ${table} 的字段不完整或数据类型无效`);
      }
    }
  }
  const labels = new Map(b.tables.quest_labels.map((row) => [row.id, row]));
  for (const quest of b.tables.quests) {
    if (quest.marker_id && labels.get(quest.marker_id)?.game !== quest.game) {
      throw new Error("备份中任务引用了不存在或不属于该作品的标签");
    }
  }
  return b;
}

export interface BackupDriver {
  exec(sql: string): void;
  rows(sql: string): BackupRow[];
  run(sql: string, values: (string | number)[]): void;
}

export function exportDatabase(driver: BackupDriver): ArchiveBackup {
  driver.exec("BEGIN");
  try {
    const tables = Object.fromEntries(backupTables.map((table) => [table,
      driver.rows(`SELECT ${backupColumns[table].split(" ").join(", ")} FROM ${table}`),
    ])) as ArchiveBackup["tables"];
    driver.exec("COMMIT");
    return { format: "xeno-archive-backup", version: 1, exportedAt: new Date().toISOString(), tables };
  } catch (error) { driver.exec("ROLLBACK"); throw error; }
}

export function restoreDatabase(driver: BackupDriver, value: unknown) {
  const backup = validateBackup(value);
  driver.exec("BEGIN IMMEDIATE");
  try {
    for (const table of [...backupTables].reverse()) driver.exec(`DELETE FROM ${table}`);
    for (const table of backupTables) {
      const columns = backupColumns[table].split(" ");
      const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
      for (const row of backup.tables[table]) driver.run(sql, columns.map((key) => row[key]));
    }
    if (driver.rows("PRAGMA foreign_key_check").length) throw new Error("备份的数据关联无效");
    driver.exec("COMMIT");
  } catch (error) { driver.exec("ROLLBACK"); throw error; }
}
