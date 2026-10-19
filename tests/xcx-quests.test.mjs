import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrateGameCodes } from "../db/migrate-game-codes.ts";
import { questMatchesFilters } from "../lib/quest-filters.ts";

const catalog = JSON.parse(await readFile(new URL("../data/xcx-quests.json", import.meta.url), "utf8"));

test("XCX upgrade preserves personal records, constraints, indexes and NPC links", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE quests (id TEXT PRIMARY KEY, game TEXT CHECK (game IN ('XC1', 'XC2', 'XC3')),
        notes TEXT, marker_id TEXT, status TEXT CHECK (status IN ('complete', 'pending')));
      CREATE INDEX quests_game_idx ON quests(game);
      CREATE TABLE quest_labels (id TEXT PRIMARY KEY, game TEXT CHECK (game IN ('XC1', 'XC2', 'XC3')), name TEXT);
      CREATE UNIQUE INDEX quest_labels_game_name_unique ON quest_labels(game, name);
      CREATE TABLE game_notes (id TEXT PRIMARY KEY, game TEXT CHECK (game IN ('XC1', 'XC2', 'XC3')), content TEXT);
      CREATE TABLE xc1_npc_quests (npc_id TEXT, quest_id TEXT REFERENCES quests(id) ON DELETE CASCADE);
      INSERT INTO quests VALUES ('personal', 'XC1', '个人备注', 'personal-label', 'pending');
      INSERT INTO quest_labels VALUES ('personal-label', 'XC1', '自定义');
      INSERT INTO game_notes VALUES ('personal-note', 'XC2', '个人笔记');
      INSERT INTO xc1_npc_quests VALUES ('npc', 'personal');
    `);
    const tables = ["quests", "quest_labels", "game_notes", "xc1_npc_quests"];
    const before = tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all());
    migrateGameCodes(database);
    migrateGameCodes(database);
    assert.deepEqual(tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all()), before);
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    database.exec("INSERT INTO quests VALUES ('xcx', 'XCX', '', '', 'complete')");
    database.exec("INSERT INTO quest_labels VALUES ('xcx-label', 'XCX', '自定义')");
    database.exec("INSERT INTO game_notes VALUES ('xcx-note', 'XCX', '正文')");
    assert.throws(() => database.exec("INSERT INTO quests VALUES ('bad', 'INVALID', '', '', 'complete')"));
    assert.throws(() => database.exec("INSERT INTO quests VALUES ('bad', 'XCX', '', '', 'INVALID')"));
    assert.throws(() => database.exec("INSERT INTO quest_labels VALUES ('duplicate', 'XCX', '自定义')"));
    assert.equal(database.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='index' AND name='quests_game_idx'").get().n, 1);
  } finally { database.close(); }
});

test("XCX upgrade rolls back all tables if a foreign key check fails", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`PRAGMA foreign_keys=OFF;
      CREATE TABLE quests (id TEXT PRIMARY KEY, game TEXT CHECK (game IN ('XC1', 'XC2', 'XC3')));
      CREATE TABLE links (quest_id TEXT REFERENCES quests(id));
      INSERT INTO links VALUES ('missing');
      PRAGMA foreign_keys=ON;`);
    const schema = database.prepare("SELECT sql FROM sqlite_schema WHERE name='quests'").get().sql;
    assert.throws(() => migrateGameCodes(database), /已回滚/);
    assert.equal(database.prepare("SELECT sql FROM sqlite_schema WHERE name='quests'").get().sql, schema);
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(database.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '%xcx_migration%'").get().n, 0);
  } finally { database.close(); }
});

test("Switch Chinese catalog keeps chapter 13, branch outcomes and separate board referrals", () => {
  assert.equal(catalog.length, 628);
  assert.equal(new Set(catalog.map((quest) => quest.id)).size, 628);
  for (const [type, count] of Object.entries({ 剧情任务: 15, 牵绊任务: 58, 普通任务: 194, 简易任务: 361 })) {
    assert.equal(catalog.filter((quest) => quest.type === type).length, count);
  }
  assert.deepEqual(catalog.filter((quest) => quest.name.startsWith("第13章")).map((quest) => quest.name), ["第13章 前篇", "第13章 中篇", "第13章 后篇"]);
  assert.ok(catalog.every((quest) => quest.game === "XCX" && quest.region && quest.giver && quest.reward && quest.sourceUrl.startsWith("https://xenobladex.cn/") && !quest.markerId && !quest.manualNotes));
  assert.equal(catalog.filter((quest) => quest.name === "机偶驾驶执照").length, 2);
  assert.equal(catalog.find((quest) => quest.id === "XCX-Q-1158").type, "普通任务");
  assert.match(catalog.find((quest) => quest.id === "XCX-Q-0142").notes, /4\. 和位于忘却溪谷/);
  const chopper = catalog.find((quest) => quest.id === "XCX-Q-0172");
  assert.match(chopper.notes, /选择“蓝色”进入分支A/);
  assert.match(chopper.reward, /报酬A.*10000.*报酬B.*20000/);
  assert.equal(catalog.find((quest) => quest.name === "收集外星人的食谱！").isExclusive, false);
  const exclusive = catalog.filter((quest) => quest.isExclusive);
  assert.deepEqual(exclusive.map((quest) => quest.id), ["XCX-Q-1023", "XCX-Q-1110"]);
  assert.equal(exclusive[0].exclusiveGroup, exclusive[1].exclusiveGroup);
  const filters = { game: "XCX", status: "all", marker: "all", type: "all", arc: "all", timed: "all", exclusive: "all", region: "all", query: "" };
  assert.ok(questMatchesFilters(chopper, { ...filters, query: "a proper chopper" }));
  assert.ok(questMatchesFilters(chopper, { ...filters, query: "霍华德" }));
  assert.ok(!questMatchesFilters(chopper, { ...filters, game: "XC1" }));
  assert.equal(catalog.filter((quest) => questMatchesFilters(quest, { ...filters, timed: "yes" })).length, 43);
});

test("XCX API persists edits, labels and notes, rejects cross-game markers, and seeds idempotently", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "xcx-quests-"));
  const previousPath = process.env.SQLITE_DATABASE_PATH;
  process.env.SQLITE_DATABASE_PATH = path.join(directory, "archive.sqlite");
  try {
    const handler = (await import("../dist/server/index.js")).default;
    const request = (url, method = "GET", body) => handler(new Request(`http://localhost${url}`, {
      method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const initial = await (await request("/api/quests")).json();
    assert.equal(initial.quests.length, 1890);
    assert.equal(initial.labels.filter((label) => label.game === "XCX" && label.isBuiltIn).length, 2);
    const quest = initial.quests.find((item) => item.id === "XCX-Q-2465");
    const saved = await request("/api/quests", "POST", { quest: { ...quest, manualNotes: "个人进度" }, originalId: quest.id });
    assert.equal(saved.status, 200);
    const labelResponse = await request("/api/quest-labels", "POST", { game: "XCX", name: "稍后处理" });
    assert.equal(labelResponse.status, 201);
    const { label } = await labelResponse.json();
    assert.equal((await request("/api/quests", "PATCH", { questId: quest.id, markerId: label.id })).status, 200);
    assert.equal((await request("/api/quests", "PATCH", { questId: quest.id, markerId: "XC1-MARK-COMPLETE" })).status, 400);
    const note = { id: "xcx-note", game: "XCX", title: "进度", category: "其他", content: "正文", isPinned: false, sortOrder: 0 };
    assert.equal((await request("/api/notes", "POST", { note })).status, 200);
    assert.equal((await (await request("/api/notes?game=XCX")).json()).notes.length, 1);
    const imported = await request("/api/quests", "PUT", { quests: [{ ...quest, manualNotes: "导入备注", markerId: label.id }] });
    assert.equal(imported.status, 200);
    assert.equal((await imported.json()).updated, 1);
    globalThis.__xenoArchiveSqlite.close();
    delete globalThis.__xenoArchiveSqlite;
    const reloaded = await (await request("/api/quests")).json();
    const persisted = reloaded.quests.find((item) => item.id === quest.id);
    assert.equal(persisted.manualNotes, "导入备注");
    assert.equal(persisted.markerId, label.id);
    assert.equal(reloaded.quests.length, 1890);
    const reset = await (await request("/api/quests", "DELETE")).json();
    assert.equal(reset.quests.filter((item) => item.game === "XCX").length, 628);
    assert.ok(reset.quests.filter((item) => item.game === "XCX").every((item) => !item.manualNotes && !item.markerId));
  } finally {
    globalThis.__xenoArchiveSqlite?.close();
    delete globalThis.__xenoArchiveSqlite;
    if (previousPath === undefined) delete process.env.SQLITE_DATABASE_PATH;
    else process.env.SQLITE_DATABASE_PATH = previousPath;
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("xcx-quests-"));
    await rm(directory, { recursive: true, force: true });
  }
});
