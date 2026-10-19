import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import initSqlJs from "sql.js";
import ts from "typescript";
import { backupTables, exportDatabase, restoreDatabase, validateBackup } from "../lib/backup.ts";

function nativeDriver(database) {
  return {
    exec: (sql) => database.exec(sql),
    rows: (sql) => database.prepare(sql).all(),
    run: (sql, values) => database.prepare(sql).run(...values),
  };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("full backup round-trips desktop → browser SQLite → desktop and rejects destructive invalid imports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "xeno-backup-test-"));
  process.env.SQLITE_DATABASE_PATH = path.join(dir, "test.sqlite");
  const handler = (await import("../dist/server/index.js")).default;
  const call = (method, body) => handler(new Request("http://localhost/api/backup", {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  let response = await call("GET");
  assert.equal(response.status, 200);
  const initial = validateBackup(await response.json());
  assert.equal(initial.tables.quests.length, 1890);
  assert.equal(Object.keys(initial.tables).length, 10);
  const backup = structuredClone(initial);
  const now = new Date().toISOString();
  backup.tables.quest_labels.push({ id: "test-label", game: "XCX", name: "离线测试标签", color: "#445566", is_built_in: 0, sort_order: 999, created_at: now });
  const quest = backup.tables.quests.find((q) => q.game === "XCX");
  quest.marker_id = "test-label"; quest.manual_notes = "私人备注，发布包不应包含"; quest.name += " 测试修改";
  backup.tables.game_notes.push({ id: "test-note", game: "XCX", title: "手机笔记", category: "战斗", content: "# 离线笔记\n中文完整内容", is_pinned: 1, sort_order: 9, created_at: now, updated_at: now });
  backup.tables.xc1_location_progress.push({ location_id: "XC1-PLACE-003", visited: 1, bookmarked: 1 });
  backup.tables.xc2_location_progress.push({ location_id: "test-location", visited: 1, bookmarked: 0 });
  backup.tables.xc2_character_progress.push({ character_id: "test-character", collected: 1, bookmarked: 1 });
  response = await call("POST", backup);
  assert.equal(response.status, 200, await response.text());
  const saved = await (await call("GET")).json();
  assert.deepEqual(saved.tables, backup.tables);

  // Compile the actual browser adapter, not a second test-only implementation.
  const source = (await readFile(new URL("../pwa/database.ts", import.meta.url), "utf8"))
    .replace('"../lib/backup"', JSON.stringify(new URL("../lib/backup.ts", import.meta.url).href))
    .replaceAll("import.meta.env.BASE_URL", '"/test/"');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const adapterPath = new URL("../work/pwa-test-adapter.mjs", import.meta.url);
  await writeFile(adapterPath, compiled);
  const { SqliteDatabase } = await import(adapterPath.href);
  const SQL = await initSqlJs();
  const bytes = await readFile(process.env.SQLITE_DATABASE_PATH);
  const engine = new SQL.Database(bytes);
  const browser = new SqliteDatabase(engine);
  try {
    assert.deepEqual(browser.exportBackup().tables, backup.tables);
    await browser.prepare("UPDATE game_notes SET content = ? WHERE id = ?").bind("手机上的新内容", "test-note").run();
    const imported = browser.exportBackup();
    response = await call("POST", imported);
    assert.equal(response.status, 200);
    assert.deepEqual((await (await call("GET")).json()).tables, imported.tables);
    const reopen = new SqliteDatabase(new SQL.Database(browser.bytes()));
    assert.equal((await reopen.prepare("SELECT content FROM game_notes WHERE id = 'test-note'").first()).content, "手机上的新内容");
    reopen.close();

    const invalidVersions = [
      { ...imported, version: 99 },
      { ...imported, tables: { ...imported.tables, quests: [{ id: "partial" }] } },
      { ...imported, tables: { ...imported.tables, game_notes: [...imported.tables.game_notes, imported.tables.game_notes[0]] } },
      { ...imported, tables: { ...imported.tables, xc1_npc_quests: [...imported.tables.xc1_npc_quests, { npc_id: "missing", quest_id: quest.id, relation: "giver" }] } },
      { ...imported, tables: { ...imported.tables, quests: imported.tables.quests.map((q) => q.id === quest.id ? { ...q, marker_id: "unknown" } : q) } },
    ];
    for (const invalid of invalidVersions) {
      assert.throws(() => browser.restoreBackup(invalid));
      assert.deepEqual(browser.exportBackup().tables, imported.tables);
      const result = await call("POST", invalid);
      assert.equal(result.status, 400);
      assert.deepEqual((await (await call("GET")).json()).tables, imported.tables);
    }
    await assert.rejects(browser.batch([
      browser.prepare("UPDATE game_notes SET content = 'should roll back' WHERE id = 'test-note'"),
      browser.prepare("INSERT INTO xc1_npc_quests VALUES ('missing', 'missing', 'giver')"),
    ]));
    assert.deepEqual(browser.exportBackup().tables, imported.tables);
  } finally { browser.close(); }

  const native = new DatabaseSync(process.env.SQLITE_DATABASE_PATH);
  try {
    const driver = nativeDriver(native);
    const final = exportDatabase(driver);
    restoreDatabase(driver, final);
    assert.deepEqual(plain(exportDatabase(driver).tables), plain(final.tables));
    assert.deepEqual(Object.keys(final.tables).sort(), [...backupTables].sort());
  } finally { native.close(); }
});
