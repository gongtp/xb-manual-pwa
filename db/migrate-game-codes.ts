import type { DatabaseSync } from "node:sqlite";

// Runtime-created databases used a three-game CHECK constraint. Rebuild only
// those tables, preserving their columns, indexes, triggers and inbound links.
export function migrateGameCodes(database: DatabaseSync) {
  const constraint = /CHECK\s*\(\s*game\s+IN\s*\(\s*'XC1'\s*,\s*'XC2'\s*,\s*'XC3'\s*\)\s*\)/i;
  const tables = database.prepare(`SELECT name, sql FROM sqlite_schema
    WHERE type = 'table' AND name IN ('quests', 'quest_labels', 'game_notes')`)
    .all() as { name: string; sql: string }[];
  const legacy = tables.filter((table) => constraint.test(table.sql));
  if (!legacy.length) return;
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  database.exec("PRAGMA foreign_keys = OFF");
  let transactionStarted = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    for (const table of legacy) {
      const objects = database.prepare(`SELECT sql FROM sqlite_schema
        WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL`)
        .all(table.name) as { sql: string }[];
      const columns = database.prepare(`PRAGMA table_info(${quote(table.name)})`)
        .all() as { name: string }[];
      const names = columns.map((column) => quote(column.name)).join(", ");
      const temporary = `${table.name}_xcx_migration`;
      const create = table.sql.replace(/^CREATE TABLE\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i, `CREATE TABLE ${quote(temporary)}`)
        .replace(constraint, "CHECK (game IN ('XC1', 'XC2', 'XC3', 'XCX'))");
      database.exec(create);
      database.exec(`INSERT INTO ${quote(temporary)} (${names}) SELECT ${names} FROM ${quote(table.name)}`);
      database.exec(`DROP TABLE ${quote(table.name)}`);
      database.exec(`ALTER TABLE ${quote(temporary)} RENAME TO ${quote(table.name)}`);
      for (const object of objects) database.exec(object.sql);
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("游戏目录升级失败：检测到无效关联，已回滚");
    }
    database.exec("COMMIT");
    transactionStarted = false;
  } catch (error) {
    // DatabaseSync.isTransaction is unavailable on older supported Node 22 releases.
    if (transactionStarted) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}
