import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchesLocationFilters, nearbyLandmarks, npcsAtLocation, projectLocations, questBelongsToRegion } from "../lib/xc1-location.ts";

let handlerPromise;

const atlas = JSON.parse(await readFile(new URL("../data/xc1-locations.json", import.meta.url), "utf8"));
const atlasFilters = { query: "", kind: "all", visited: "all", bookmarked: false };

test("XC1 atlas preserves Simplified Chinese names and separates story maps", () => {
  assert.equal(atlas.regions.length, 26);
  assert.equal(atlas.locations.length, 485);
  assert.equal(new Set(atlas.locations.map((item) => item.id)).size, 485);
  const regions = new Map(atlas.regions.map((region) => [region.id, region]));
  assert.equal(atlas.locations.filter((item) => regions.get(item.regionId).arc === "main").length, 431);
  assert.equal(atlas.locations.filter((item) => regions.get(item.regionId).arc === "futureConnected").length, 54);
  assert.equal(atlas.locations.filter((item) => item.kind === "secret").length, 20);
  assert.ok(atlas.locations.every((item) => regions.has(item.regionId) && item.name && item.englishName &&
    Object.values(item.position).every(Number.isFinite) && ["landmark", "location", "secret"].includes(item.kind)));
  assert.equal(atlas.locations.find((item) => item.id === "XC1-PLACE-448").name, "雄伟拱门");
  assert.equal(atlas.locations.find((item) => item.id === "XC1-PLACE-441").name, "禅洞门");
  assert.equal(atlas.locations.find((item) => item.id === "XC1-PLACE-055").kind, "secret");
  assert.equal(atlas.locations.find((item) => item.id === "XC1-PLACE-011").kind, "location");
  assert.equal(atlas.locations.find((item) => item.id === "XC1-PLACE-002").rewards.exp, 0);
  assert.deepEqual(atlas.regions.filter((region) => region.name === "监狱岛").map((region) => region.stage), ["初访", "再访"]);
  assert.deepEqual(atlas.regions.filter((region) => region.name === "皇都阿卡莫托").map((region) => region.arc), ["main", "futureConnected"]);
  assert.ok(!regions.has("XC1-REGION-10") && !regions.has("XC1-REGION-34"));
});

test("atlas search, progress filters and related records respect the selected arc", async () => {
  const place = atlas.locations.find((item) => item.id === "XC1-PLACE-003");
  const colony = atlas.regions.find((region) => region.id === place.regionId);
  assert.ok(matchesLocationFilters(place, colony, { ...atlasFilters, query: "9号殖民地 正面入口" }));
  assert.ok(matchesLocationFilters(place, colony, { ...atlasFilters, query: "COLONY 9 entrance" }));
  assert.ok(!matchesLocationFilters(place, colony, { ...atlasFilters, kind: "secret" }));
  assert.ok(!matchesLocationFilters(place, colony, { ...atlasFilters, bookmarked: true }));
  const progress = { id: place.id, visited: true, bookmarked: true };
  assert.ok(matchesLocationFilters(place, colony, { ...atlasFilters, visited: "visited", bookmarked: true }, progress));
  assert.ok(!matchesLocationFilters(place, colony, { ...atlasFilters, visited: "unvisited" }, progress));
  const fcRegion = atlas.regions.find((region) => region.id === "XC1-REGION-30");
  const mainRegion = atlas.regions.find((region) => region.id === "XC1-REGION-13");
  const quest = { game: "XC1", chapter: "相连的未来 · 随剧情开放", region: "皇都阿卡莫托（相连的未来）" };
  assert.ok(questBelongsToRegion(quest, fcRegion));
  assert.ok(!questBelongsToRegion(quest, mainRegion));
  assert.ok(!questBelongsToRegion({ ...quest, game: "XC2" }, fcRegion));
  const npcs = JSON.parse(await readFile(new URL("../data/xc1-npcs.json", import.meta.url), "utf8"));
  const cape = atlas.locations.find((item) => item.id === "XC1-PLACE-434");
  const shoulder = atlas.regions.find((region) => region.id === cape.regionId);
  assert.ok(npcsAtLocation(npcs, cape, shoulder).some((npc) => npc.name === "雷纳特"));
});

test("atlas position projection handles vertical maps and nearby references stay in the same region", () => {
  for (const region of atlas.regions) {
    const locations = atlas.locations.filter((item) => item.regionId === region.id);
    assert.ok(projectLocations(locations).every((point) => point.left >= 0 && point.left <= 100 && point.top >= 0 && point.top <= 100));
  }
  const point = atlas.locations[0];
  const samePosition = [{ ...point, id: "a" }, { ...point, id: "b", position: { ...point.position, y: 100 } }];
  assert.deepEqual(projectLocations(samePosition).map(({ left, top }) => [left, top]), [[50, 50], [50, 50]]);
  assert.deepEqual(projectLocations([]), []);
  const nearby = nearbyLandmarks(point, atlas.locations);
  assert.ok(nearby.every((item) => item.location.id !== point.id && item.location.regionId === point.regionId && item.location.kind !== "location"));
  assert.ok(nearby[0].distance <= nearby[1].distance);
});

test("atlas API persists independent progress fields and rejects invalid writes", async () => {
  async function patch(body) {
    return render("/api/xc1-locations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  const id = "XC1-PLACE-003";
  const original = (await (await render("/api/xc1-locations")).json()).progress.find((entry) => entry.id === id);
  try {
    assert.equal((await patch({ id, visited: true, bookmarked: false })).status, 200);
    const response = await patch({ id, bookmarked: true });
    assert.deepEqual((await response.json()).progress, { id, visited: true, bookmarked: true });
    const get = await render("/api/xc1-locations");
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.deepEqual((await get.json()).progress.find((entry) => entry.id === id), { id, visited: true, bookmarked: true });
    assert.equal((await patch({ id, visited: "false" })).status, 400);
    assert.equal((await patch({ id: "XC2-PLACE-003", visited: true })).status, 400);
    assert.equal((await patch({ id })).status, 400);
    assert.equal((await patch(null)).status, 400);
    assert.equal((await render("/api/xc1-locations", { method: "PATCH", body: "{" })).status, 400);
    const unvisit = await patch({ id, visited: false });
    assert.deepEqual((await unvisit.json()).progress, { id, visited: false, bookmarked: true });
  } finally {
    await patch({ id, visited: original?.visited ?? false, bookmarked: original?.bookmarked ?? false });
  }
});

async function render(pathname = "/", init) {
  handlerPromise ??= import(new URL("../dist/server/index.js", import.meta.url).href)
    .then((module) => module.default);
  const handler = await handlerPromise;

  return handler(
    new Request(`http://localhost${pathname}`, init ?? {
      headers: { accept: "text/html" },
    }),
  );
}

test("server-renders the quest archive", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>异度资料库｜任务资料维护系统<\/title>/);
  assert.match(html, /异度神剑 1/);
  assert.match(html, /任务资料/);
  assert.doesNotMatch(html, /资料状态概览|class="status-card/);
  assert.match(html, /SQLite/);
  assert.match(html, /导入/);
  assert.match(html, /新建任务/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("links quest types to each game", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const model = await readFile(new URL("../lib/quest.ts", import.meta.url), "utf8");
  const filters = await readFile(new URL("../lib/quest-filters.ts", import.meta.url), "utf8");
  const storyProgress = await readFile(new URL("../lib/xc1-story-progress.ts", import.meta.url), "utf8");
  assert.match(model, /manualNotes: string/);
  assert.match(model, /XC1:\s*\["支线任务", "剧情任务", "突发任务"\]/);
  assert.match(model, /XC2:\s*\["主线任务", "普通任务", "异刃任务", "佣兵团任务", "特殊事件"\]/);
  assert.match(model, /XC3:\s*\["主线剧情", "英雄任务", "普通任务"\]/);
  assert.match(page, /function changeGameFilter/);
  assert.match(page, /useState<GameCode>\("XC1"\)/);
  assert.doesNotMatch(page, /全部作品/);
  assert.match(page, /const sidebarModulesByGame: Record<GameCode, SidebarModule\[]>/);
  assert.match(page, /className="game-library-nav"/);
  assert.match(page, /className="game-module-nav"/);
  assert.doesNotMatch(page, />资料模块</);
  assert.match(page, /label: "玩法笔记", target: "notes"/);
  assert.match(page, /label: "角色与 NPC", target: "npcs"/);
  assert.match(page, /<GameNotes game=\{gameFilter\}/);
  assert.match(page, /<XC1NpcDirectory/);
  assert.match(page, /function openNpcFromQuest/);
  assert.match(page, /function openQuestFromNpc/);
  assert.match(page, /className="record-giver giver-link"/);
  assert.match(page, /角色与异刃/);
  assert.match(page, /角色与英雄/);
  assert.match(page, /职业与技能/);
  assert.match(page, /const gameQuests = useMemo/);
  assert.match(page, /game: gameFilter/);
  assert.doesNotMatch(page, /<label>游戏<select/);
  assert.match(page, /setTypeFilter\("all"\)/);
  assert.match(page, /setRegionFilter\("all"\)/);
  assert.match(page, /const \[arcFilter, setArcFilter\]/);
  assert.match(page, /const \[timedFilter, setTimedFilter\]/);
  assert.match(page, /const \[exclusiveFilter, setExclusiveFilter\]/);
  assert.match(filters, /getQuestArc\(quest\) !== filters\.arc/);
  assert.match(filters, /quest\.isTimed !== \(filters\.timed === "yes"\)/);
  assert.match(filters, /quest\.isExclusive !== \(filters\.exclusive === "yes"\)/);
  assert.match(page, /const matchesQuestFilters = useCallback/);
  assert.match(page, /questMatchesFilters\(quest, filterState, omitted\)/);
  assert.match(filters, /omitted !== "region"/);
  assert.match(page, /const filterFacets = useMemo/);
  assert.match(page, /pool\("timed"\)/);
  assert.match(page, /pool\("exclusive"\)/);
  assert.match(page, /pool\("region"\)/);
  assert.match(page, /filterFacets\.timed\.yes/);
  assert.match(page, /filterFacets\.timed\.no/);
  assert.match(page, /filterFacets\.exclusive\.groups/);
  assert.match(page, /filterFacets\.region\.counts\.get\(region\)/);
  assert.doesNotMatch(page, /setTimedFilter\(event\.target\.value as BinaryQuestFilter\); setRegionFilter\("all"\)/);
  assert.doesNotMatch(page, /setExclusiveFilter\(event\.target\.value as BinaryQuestFilter\); setRegionFilter\("all"\)/);
  assert.match(page, /function changeArcFilter\(arc: QuestArcFilter\) \{\s*setArcFilter\(arc\);[\s\S]*?setCurrentPage\(1\);\s*\}/);
  assert.match(page, /if \(exclusiveFilter !== "yes"\) return filtered/);
  assert.match(page, /getExclusiveGroup\(left\)\.localeCompare\(getExclusiveGroup\(right\)/);
  assert.match(filters, /quest\.region !== filters\.region/);
  assert.match(page, /<span>任务记录<\/span><span>类型<\/span><span>地区<\/span>/);
  assert.match(page, /<span>委托人<\/span><span>章节 \/ 进度<\/span><span>前置条件<\/span><span>手动备注<\/span><span>标记<\/span>\s*<\/div>/);
  assert.match(page, /className="record-giver"/);
  assert.match(page, /className=\{`record-type quest-type \$\{getQuestTypeTone\(quest\.type\)\}`\}/);
  assert.match(page, /getQuestTypeTone\(selectedQuest\.type\)/);
  assert.match(globalStyles, /\.quest-type\.type-story/);
  assert.match(globalStyles, /\.quest-type\.type-standard/);
  assert.match(globalStyles, /\.quest-type\.type-event/);
  assert.match(globalStyles, /\.quest-type\.type-character/);
  assert.match(page, /className="record-progress"/);
  assert.match(page, /className="record-prerequisites"/);
  assert.doesNotMatch(page, /数据依据/);
  assert.match(page, /getChapterProgressLabel\(quest\.chapter, quest\.game\)/);
  assert.match(page, /formatXC1StoryProgress\(quest\.prerequisites\)/);
  assert.match(page, /页面显示：\{getChapterProgressLabel\(editingQuest\.chapter, editingQuest\.game\)\}/);
  assert.match(storyProgress, /158: \{ chapter: 8, label: "初到皇都阿卡莫托/);
  assert.match(storyProgress, /380: \{ chapter: 17, label: "6号殖民地防卫战结束/);
  assert.match(page, /className="record-manual-notes"/);
  assert.match(page, /"搜索任务名称或编号"/);
  assert.match(filters, /return !needle \|\| searchable/);
  assert.doesNotMatch(page, /placeholder="搜索任务、编号、地区或来源"/);
  assert.match(page, /className="quest-flag timed">\{quest.game === "XCX" \? "接取期限" : "限时"\}/);
  assert.doesNotMatch(page, /className=\{`record-timed/);
  assert.match(page, /pagedQuests\.map/);
  assert.match(page, /className="records-footer"/);
  assert.match(page, /function resetQuestFilters/);
  assert.match(page, /const \[detailOpen, setDetailOpen\] = useState\(false\)/);
  assert.match(page, /setDetailOpen\(true\)/);
  assert.match(page, /className="detail-modal"/);
  assert.match(page, /className="detail-modal-body"/);
  assert.match(page, /className="close-button"/);
  assert.match(page, /<UiIcon name="close" size=\{17\} \/>/);
  assert.match(globalStyles, /--font-ui: "Segoe UI Variable Text"/);
  assert.match(globalStyles, /--font-title: "Segoe UI Variable Display"/);
  assert.match(globalStyles, /font-family: var\(--font-title\)/);
  assert.doesNotMatch(globalStyles, /Georgia|Songti SC/);
  assert.doesNotMatch(page, /className="detail-panel"/);
  assert.doesNotMatch(page, /status-strip|status-card/);
  assert.doesNotMatch(page, /qualityPercent|const stats =/);
  assert.doesNotMatch(page, /status-card conflict/);
  assert.doesNotMatch(page, /className="quality-meter"/);
  assert.match(page, /aria-label="选择任务篇章"/);
  assert.match(page, /\["main", "futureConnected"\] as const/);
  assert.match(page, /arc === "main" \? "本篇" : "相连的未来"/);
  assert.match(page, /扩展票追加（\{filterFacets\.arc\.expansionPass\}）/);
  assert.match(page, /黄金之国伊拉（\{filterFacets\.arc\.torna\}）/);
  assert.match(page, /崭新的未来（\{filterFacets\.arc\.futureRedeemed\}）/);
  assert.match(page, /是否限时/);
  assert.match(page, /是否互斥/);
  assert.match(page, /supportsQuestRiskFlags\(gameFilter\) && <label>\{gameFilter === "XCX" \? "接取期限" : "是否限时"\}/);
  assert.match(page, /supportsQuestRiskFlags\(gameFilter\) && <label>是否互斥/);
  assert.match(page, /互斥任务/);
  assert.match(page, /placeholder="输入任务名称搜索"/);
  assert.match(page, /const name = quest\.name\.toLowerCase\(\)/);
  assert.match(page, /已与 \$\{lockedPeer\?\.name \?\? "其他任务"\} 互斥/);
  assert.doesNotMatch(page, /<label>互斥组<input/);
  assert.doesNotMatch(page, /<label>互斥路线<input/);
});

test("persists task changes through the SQLite API", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/quests/route.ts", import.meta.url), "utf8");
  const database = await readFile(new URL("../db/quests.ts", import.meta.url), "utf8");
  const connection = await readFile(new URL("../db/index.ts", import.meta.url), "utf8");
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");

  assert.match(page, /dataFetch\("\/api\/quests"/);
  assert.doesNotMatch(page, /localStorage/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function POST/);
  assert.match(api, /export async function PUT/);
  assert.match(api, /export async function PATCH/);
  assert.match(api, /export async function DELETE/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS quests/);
  assert.match(database, /import xc3QuestData from "\.\.\/data\/xc3-quests\.json"/);
  assert.match(database, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(database, /is_timed = excluded\.is_timed/);
  assert.match(database, /is_exclusive = excluded\.is_exclusive/);
  assert.match(database, /manual_notes = excluded\.manual_notes/);
  assert.match(database, /PRAGMA table_info\(quests\)/);
  assert.match(database, /exclusiveGroupForPair/);
  assert.match(database, /已经与其他任务互斥，请先解除原关系/);
  assert.match(api, /exclusivePeerId/);
  assert.match(page, /return quest\.isTimed/);
  assert.match(page, /return quest\.isExclusive \? quest\.exclusiveGroup : ""/);
  assert.match(page, /手动备注<textarea value=\{editingQuest\.manualNotes\}/);
  assert.match(page, /MarkdownPreview content=\{selectedQuest\.notes\} compact/);
  assert.match(page, /任务流程（Markdown）/);
  assert.match(page, /questNotesView === "preview"/);
  assert.match(connection, /from "node:sqlite"/);
  assert.match(connection, /path\.join\("data", "xeno-archive\.sqlite"\)/);
  assert.match(connection, /BEGIN IMMEDIATE/);
  assert.match(connection, /ROLLBACK/);
  assert.doesNotMatch(connection, /cloudflare:workers|D1Database/);
  assert.doesNotMatch(viteConfig, /cloudflare|Miniflare|d1_databases/);
});

test("combines filters and calculates option facets from the other active filters", async () => {
  const { questMatchesFilters } = await import("../lib/quest-filters.ts");
  const quests = JSON.parse(await readFile(new URL("../data/xc1-quests.json", import.meta.url), "utf8"));
  const groups = Map.groupBy(quests, (quest) => quest.region);
  const sample = [...groups.entries()].find(([, records]) => (
    records.some((quest) => quest.isTimed) && records.some((quest) => !quest.isTimed)
  ));
  assert.ok(sample, "需要一个同时包含限时与非限时任务的地区作为组合筛选样本");
  const [region, regionQuests] = sample;
  const filters = {
    game: "XC1",
    status: "all",
    marker: "all",
    type: "all",
    arc: "all",
    timed: "all",
    exclusive: "all",
    region,
    query: "",
  };

  const timedFacetPool = quests.filter((quest) => questMatchesFilters(quest, filters, "timed"));
  assert.equal(timedFacetPool.length, regionQuests.length);
  assert.equal(
    timedFacetPool.filter((quest) => quest.isTimed).length
      + timedFacetPool.filter((quest) => !quest.isTimed).length,
    regionQuests.length,
  );

  const combinedFilters = { ...filters, timed: "yes" };
  const combinedRows = quests.filter((quest) => questMatchesFilters(quest, combinedFilters));
  assert.ok(combinedRows.length > 0);
  assert.ok(combinedRows.every((quest) => quest.region === region && quest.isTimed));

  const regionFacetPool = quests.filter((quest) => questMatchesFilters(quest, combinedFilters, "region"));
  assert.equal(regionFacetPool.filter((quest) => quest.region === region).length, combinedRows.length);

  const exclusiveFacetPool = quests.filter((quest) => questMatchesFilters(quest, combinedFilters, "exclusive"));
  assert.equal(
    exclusiveFacetPool.filter((quest) => quest.isExclusive).length
      + exclusiveFacetPool.filter((quest) => !quest.isExclusive).length,
    exclusiveFacetPool.length,
  );
});

test("initializes the public catalog in a fresh SQLite database", async () => {
  const questResponse = await render("/api/quests");
  assert.equal(questResponse.status, 200);
  const questPayload = await questResponse.json();
  assert.equal(questPayload.quests.length, 1890);
  assert.equal(questPayload.quests.filter((quest) => quest.game === "XCX").length, 628);
  assert.equal(questPayload.quests.filter((quest) => quest.game === "XC2").length, 493);
  assert.equal(questPayload.quests.filter((quest) => quest.game === "XC3").length, 246);
  assert.ok(questPayload.quests.filter((quest) => quest.game === "XC2").every((quest) => (
    !quest.isTimed && !quest.isExclusive && !quest.exclusiveGroup && !quest.exclusiveRoute
  )));
  assert.ok(questPayload.quests.filter((quest) => quest.game === "XC2").every((quest) => quest.notes.startsWith("## ")));
  assert.ok(questPayload.quests.filter((quest) => quest.game === "XC2" && quest.type === "特殊事件").every((quest) => (
    !/[{][|]|wikitable|\d+px|缩略图|\]\]|；===/.test(quest.notes)
  )));
  assert.ok(questPayload.labels.length >= 2);
  assert.ok(questPayload.labels.some((label) => label.id === "XC1-MARK-INCOMPLETE"));

  const noteResponse = await render("/api/notes?game=XC1");
  assert.equal(noteResponse.status, 200);
  const notePayload = await noteResponse.json();
  assert.ok(notePayload.notes.some((note) => note.title === "全任务完成注意事项"));
  assert.ok(notePayload.notes.some((note) => note.title === "6号殖民地复兴材料"));

  const npcResponse = await render("/api/xc1-npcs");
  assert.equal(npcResponse.status, 200);
  const npcPayload = await npcResponse.json();
  assert.equal(npcPayload.npcs.length, 176);
  assert.equal(npcPayload.npcs.reduce((count, npc) => count + npc.questIds.length, 0), 326);
});

test("rolls back failed ordinary SQLite batches", async () => {
  const { SqliteDatabase } = await import("../db/index.ts");
  const database = new SqliteDatabase(":memory:");
  try {
    await database.prepare("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)").run();
    const insert = database.prepare("INSERT INTO sample (id, value) VALUES (?, ?)");
    await database.batch([
      insert.bind(1, "first"),
      insert.bind(2, "second"),
    ]);
    await assert.rejects(() => database.batch([
      insert.bind(3, "third"),
      insert.bind(2, "duplicate"),
    ]));
    const result = await database.prepare("SELECT COUNT(*) AS count FROM sample").first();
    assert.equal(result.count, 2);
  } finally {
    database.close();
  }
});

test("persists selectable and custom quest markers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const model = await readFile(new URL("../lib/quest.ts", import.meta.url), "utf8");
  const questApi = await readFile(new URL("../app/api/quests/route.ts", import.meta.url), "utf8");
  const labelApi = await readFile(new URL("../app/api/quest-labels/route.ts", import.meta.url), "utf8");
  const questsDatabase = await readFile(new URL("../db/quests.ts", import.meta.url), "utf8");
  const labelsDatabase = await readFile(new URL("../db/quest-labels.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0004_aromatic_morlocks.sql", import.meta.url), "utf8");

  assert.match(model, /markerId: string/);
  assert.match(model, /export type QuestLabel/);
  assert.match(page, /dataFetch\("\/api\/quest-labels"/);
  assert.match(page, /<label>标记<select value=\{markerFilter\}/);
  assert.doesNotMatch(page, /<label>资料状态<select value=\{statusFilter\}/);
  assert.match(labelsDatabase, /name: "未完成"/);
  assert.match(labelsDatabase, /name: "已完成"/);
  assert.match(page, /新建自定义标签/);
  assert.match(page, /添加并标记/);
  assert.match(page, />取消标记<\/button>/);
  assert.match(page, /function deleteCustomLabel/);
  assert.match(page, /正在被 \$\{usageCount\} 个任务使用/);
  assert.match(page, /className="delete-marker-label"/);
  assert.match(page, /requestQuestDatabase\("PATCH", \{ questId: quest\.id, markerId \}\)/);
  assert.match(questApi, /setQuestMarker/);
  assert.match(labelApi, /export async function POST/);
  assert.match(labelApi, /export async function DELETE/);
  assert.match(questsDatabase, /marker_id TEXT NOT NULL DEFAULT ''/);
  assert.match(questsDatabase, /UPDATE quests SET marker_id = \?/);
  assert.match(labelsDatabase, /CREATE TABLE IF NOT EXISTS quest_labels/);
  assert.match(labelsDatabase, /crypto\.getRandomValues/);
  assert.match(labelsDatabase, /nextUniqueColor/);
  assert.match(labelsDatabase, /export async function deleteQuestLabel/);
  assert.match(labelsDatabase, /if \(label\.is_built_in\) throw new Error\("内置标签不能删除"\)/);
  assert.match(labelsDatabase, /NOT EXISTS \(SELECT 1 FROM quests WHERE marker_id = quest_labels\.id\)/);
  assert.match(migration, /CREATE TABLE `quest_labels`/);
  assert.match(migration, /ALTER TABLE `quests` ADD `marker_id`/);
});

test("persists editable Markdown gameplay notes by game", async () => {
  const component = await readFile(new URL("../app/game-notes.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/notes/route.ts", import.meta.url), "utf8");
  const database = await readFile(new URL("../db/game-notes.ts", import.meta.url), "utf8");
  const seed = await readFile(new URL("../data/game-notes.ts", import.meta.url), "utf8");
  const questCatalog = JSON.parse(await readFile(new URL("../data/xc1-quests.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0003_harsh_franklin_richards.sql", import.meta.url), "utf8");

  assert.match(component, /dataFetch\(method === "GET" \? `\/api\/notes\?game=\$\{game\}`/);
  assert.match(component, /aria-label="编辑器视图"/);
  assert.match(component, /MarkdownPreview/);
  assert.match(component, /新建笔记/);
  assert.match(component, /编辑玩法笔记/);
  assert.match(component, /删除笔记/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function POST/);
  assert.match(api, /export async function DELETE/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS game_notes/);
  assert.match(database, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(database, /game_notes_seed_v1/);
  assert.match(database, /game_notes_content_seed_v3/);
  assert.match(migration, /CREATE TABLE `game_notes`/);
  assert.match(seed, /title: "全任务完成注意事项"/);
  assert.match(seed, /25 组、50 条互斥路线/);
  assert.match(seed, /朱朱询问是否让难民迁往/);
  assert.match(seed, /准备挑战本区域最后的 Boss/);
  assert.match(seed, /完成机神界中枢事件之前/);
  assert.match(seed, /先不要做/);
  assert.match(seed, /quest\.name/);
  assert.match(seed, /quest\.id/);
  assert.match(seed, /数量校验/);
  assert.match(seed, /title: "毕业配装：DOT流与0球流"/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 倒地锁 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 治疗特化 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 持续伤害 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 以太坦克 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 倒地辅助 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 倒地坦克 \|/);
  assert.match(seed, /\| 部位 \| 装备 \| 通用 \| 纯治疗 \|/);
  assert.match(seed, /夜间命中上升VI、双重攻击VI、倒地时间延长VI/);
  assert.match(seed, /散热片VI、雷属性强化VI、战技仇恨值降低VI/);
  assert.match(seed, /进攻Ⅴ型护目镜\[1\]/);
  assert.match(seed, /进攻Ⅴ型机关\[1\]/);
  assert.match(seed, /进攻Ⅴ型助推器\[1\]/);
  assert.match(seed, /速度Ⅴ型骨架/);
  assert.match(seed, /伊迪亚之剑\[3\]/);
  assert.match(seed, /谢德娜浮翼/);
  assert.match(seed, /本篇：宝珠结晶去哪刷/);
  assert.match(seed, /磷光之地扎托尔Lv84“扎托尔巨鹰”/);
  assert.match(seed, /相连的未来：全角色照抄配装/);
  assert.match(seed, /巨神肩27—29号矿床：玛尔珈的哀叹东侧/);
  assert.match(seed, /彗星魔杖\[3\]、慈母墙墙\[3\]、球果喷喷\[3\]/);
  assert.doesNotMatch(seed, /Attack V Goggles／Arms／Boosters/);
  assert.match(seed, /虎 \+ 莱克斯 \+ 齐格/);
  assert.match(seed, /花JD：主输出、破防与0球Lv1/);
  assert.match(seed, /花JK：猛击与紧急防守/);
  assert.match(seed, /花JS：倒地、地属性起手与保命/);
  assert.match(seed, /exclusiveGroupTable/);
  assert.match(seed, /immediateExclusiveGroups/);
  assert.match(seed, /CROSS-03 只有“冒险者们的遇难”属于限时记录/);
  assert.match(seed, /maximumTimedCompletions/);

  const configuredRisks = new Set(
    [...seed.matchAll(/tasksWithRisk\("([^"]+)"\)/g)].map((match) => match[1]),
  );
  const timedQuests = questCatalog.filter((quest) => quest.isTimed);
  const missingFromChecklist = timedQuests.filter((quest) => {
    const risk = quest.notes.match(/截止点\/风险：([^；]+)/)?.[1] ?? "未标注截止点";
    return !configuredRisks.has(risk);
  });
  assert.equal(timedQuests.length, 130);
  assert.deepEqual(missingFromChecklist, []);
  const exclusiveQuests = questCatalog.filter((quest) => quest.isExclusive);
  assert.equal(exclusiveQuests.length, 50);
  assert.equal(new Set(exclusiveQuests.map((quest) => quest.exclusiveGroup)).size, 25);
});

test("includes the verified Xenoblade 1 quest catalog", async () => {
  const source = await readFile(new URL("../data/xc1-quests.json", import.meta.url), "utf8");
  const quests = JSON.parse(source);
  const ids = new Set(quests.map((quest) => quest.id));
  const typeCounts = quests.reduce((counts, quest) => {
    counts[quest.type] = (counts[quest.type] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(quests.length, 523);
  assert.equal(ids.size, quests.length);
  assert.deepEqual(typeCounts, { "支线任务": 476, "剧情任务": 33, "突发任务": 14 });
  assert.ok(quests.every((quest) => quest.status === "complete"));
  assert.ok(quests.every((quest) => quest.game === "XC1"));
  assert.ok(quests.every((quest) => quest.sourceUrl.startsWith("https://")));
  assert.ok(quests.every((quest) => !quest.prerequisites.includes("任务报酬")));
  assert.ok(quests.every((quest) => !quest.giver.includes("具体姓名见详情")));
  assert.ok(quests.every((quest) => !quest.reward.includes("具体数值见详情")));
  assert.equal(quests.filter((quest) => quest.chapter.startsWith("本篇 ·")).length, 480);
  const futureConnectedQuests = quests.filter((quest) => quest.chapter.startsWith("相连的未来 ·"));
  assert.equal(futureConnectedQuests.length, 43);
  assert.ok(quests.every((quest) => !quest.sourceUrl.includes("bing.com")));
  assert.ok(futureConnectedQuests.every((quest) => (
    quest.giver === "剧情自动触发" || /[\u3400-\u9fff]/u.test(quest.giver)
  )));
  assert.ok(futureConnectedQuests.every((quest) => (
    quest.sourceUrl.startsWith("https://xenobladedata.github.io/xb1de/bdat/bdat_common_ms/JNL_quest2501_ms.html#")
      || quest.sourceUrl === "https://xenobladedata.github.io/xb1de/bdat/bdat_common_ms/JNL_quest2601_ms.html#2"
  )));
  assert.equal(futureConnectedQuests.find((quest) => quest.id === "XC1-Q-0488")?.giver, "哈巧巧");
  assert.equal(futureConnectedQuests.find((quest) => quest.id === "XC1-Q-0521")?.giver, "多多拉");
  assert.equal(futureConnectedQuests.find((quest) => quest.id === "XC1-Q-0523")?.giver, "马克西斯");
  assert.equal(quests.filter((quest) => quest.notes.includes("限时：是")).length, 130);
  assert.equal(quests.filter((quest) => quest.notes.includes("互斥组：")).length, 50);
  assert.equal(quests.filter((quest) => quest.isTimed).length, 130);
  assert.equal(quests.filter((quest) => quest.isExclusive).length, 50);
  assert.ok(quests.every((quest) => typeof quest.isTimed === "boolean"));
  assert.ok(quests.every((quest) => typeof quest.isExclusive === "boolean"));
  assert.ok(quests.every((quest) => quest.manualNotes === ""));
  assert.ok(quests.filter((quest) => quest.isExclusive).every((quest) => quest.exclusiveGroup && quest.exclusiveRoute));
  const exclusiveGroups = quests.reduce((groups, quest) => {
    const match = quest.notes.match(/互斥组：([^；]+)/);
    if (!match) return groups;
    groups.set(match[1], [...(groups.get(match[1]) ?? []), quest.id]);
    return groups;
  }, new Map());
  assert.equal(exclusiveGroups.size, 25);
  assert.ok([...exclusiveGroups.values()].every((ids) => ids.length === 2));
  assert.ok([...exclusiveGroups.keys()].every((group) => {
    const routes = quests
      .filter((quest) => quest.notes.includes(`互斥组：${group}；`))
      .map((quest) => quest.notes.match(/路线：([^；]+)/)?.[1])
      .sort();
    return JSON.stringify(routes) === JSON.stringify(["A", "B"]);
  }));
  assert.ok(quests.every((quest) => quest.notes.includes("英文原名：")));
  assert.equal(quests.filter((quest) => quest.type === "突发任务" && quest.notes.includes("类型核验：突发任务")).length, 14);
  assert.ok(quests.every((quest) => ["支线任务", "剧情任务", "突发任务"].includes(quest.type)));
  assert.deepEqual(
    quests.filter((quest) => ["XC1-Q-0453", "XC1-Q-0454", "XC1-Q-0455"].includes(quest.id)).map((quest) => quest.name),
    ["攻击待机部队！", "强行突破！", "屋顶上的决战！"],
  );
});

test("links named Xenoblade 1 quest givers to locations and active times", async () => {
  const component = await readFile(new URL("../app/xc1-npcs.tsx", import.meta.url), "utf8");
  const database = await readFile(new URL("../db/xc1-npcs.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/xc1-npcs/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0005_outgoing_warbound.sql", import.meta.url), "utf8");
  const quests = JSON.parse(await readFile(new URL("../data/xc1-quests.json", import.meta.url), "utf8"));
  const npcs = JSON.parse(await readFile(new URL("../data/xc1-npcs.json", import.meta.url), "utf8"));
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const linkedQuestIds = npcs.flatMap((npc) => npc.questIds);

  assert.equal(npcs.length, 176);
  assert.equal(new Set(npcs.map((npc) => npc.id)).size, npcs.length);
  assert.equal(npcs.filter((npc) => npc.arc === "main").length, 140);
  assert.equal(npcs.filter((npc) => npc.arc === "futureConnected").length, 36);
  assert.equal(linkedQuestIds.length, 326);
  assert.equal(new Set(linkedQuestIds).size, linkedQuestIds.length);
  assert.ok(npcs.every((npc) => npc.name && npc.questIds.length && npc.appearances.length));
  assert.ok(npcs.every((npc) => npc.appearances.every((appearance) => (
    appearance.region && appearance.location && appearance.activeTime
  ))));
  assert.ok(npcs.every((npc) => npc.questIds.every((questId) => questById.get(questId)?.giver === npc.name)));
  assert.ok(npcs.every((npc) => !/居民|防卫队员|自动触发|士兵|村民|市民/.test(npc.name)));

  const supplemental = JSON.parse(await readFile(new URL("../data/xc1-npc-supplement.json", import.meta.url), "utf8"));
  assert.equal(supplemental.length, 17);
  assert.ok(supplemental.every((record) => npcs.some((npc) => npc.name === record.name)));
  const expectedBranches = [["XC1-Q-0165", "莓酱酱"], ["XC1-Q-0166", "梅奇希里亚"],
    ["XC1-Q-0175", "簪·银"], ["XC1-Q-0189", "安·银"],
    ["XC1-Q-0176", "欧尔克霍古"], ["XC1-Q-0190", "帕痞"]];
  for (const [id, name] of expectedBranches) {
    assert.equal(questById.get(id).giver, name);
    assert.deepEqual(npcs.filter((npc) => npc.questIds.includes(id)).map((npc) => npc.name), [name]);
  }
  const shulk = npcs.find((npc) => npc.name === "修尔克");
  assert.match(shulk.appearances[0].location, /兵器开发局/);
  assert.match(shulk.appearances[0].condition, /作队长调查触发/);
  assert.equal(npcs.find((npc) => npc.name === "芭涅雅").appearances[0].location, "废品号甲板");
  assert.deepEqual(npcs.find((npc) => npc.name === "６号殖民地的大小姐").questIds, ["XC1-Q-0163", "XC1-Q-0167"]);
  const npcNames = new Set(npcs.map((npc) => npc.name));
  const nonPersonGivers = new Set(["全体６号殖民地居民","剧情任务","剧情自动触发","废品号船员","机神界人驻扎部队","海恩塔灯塔看守","海恩塔难民","终端：均衡兵力","终端：情报战略","终端：维持治安","终端：都市计划","自动触发","荷姆斯旅行者","营地居民","诺彭商会","诺彭调查队","边境村居民","防卫队员","阿卡莫托卫兵","阿卡莫托居民","９号殖民地居民"]);
  assert.deepEqual([...new Set(quests.filter((quest) => !npcNames.has(quest.giver) && !nonPersonGivers.has(quest.giver))
    .map((quest) => quest.giver))], []);

  const werner = npcs.find((npc) => npc.name === "维尔纳");
  assert.deepEqual(werner.appearances, [
    { region: "９号殖民地", location: "机神兵残骸遗迹", activeTime: "6:00 ~ 6:00", condition: "" },
    { region: "６号殖民地", location: "６号殖民地 复兴总部", activeTime: "3:00 ~ 12:00", condition: "随剧情推进或移居后" },
  ]);
  const reinert = npcs.find((npc) => npc.name === "雷纳特");
  assert.equal(reinert.arc, "futureConnected");
  assert.equal(reinert.appearances[0].location, "盟友海角");
  assert.deepEqual(reinert.questIds, ["XC1-Q-0483", "XC1-Q-0484", "XC1-Q-0485", "XC1-Q-0486"]);

  assert.match(component, /角色与 NPC/);
  assert.match(component, /出现位置与时间/);
  assert.match(component, /关联任务/);
  assert.match(component, /涉及限时/);
  assert.match(component, /涉及互斥/);
  assert.match(component, /onOpenQuest\(quest\.id\)/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS xc1_npcs/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS xc1_npc_appearances/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS xc1_npc_quests/);
  assert.match(database, /xc1_npc_seed_version/);
  assert.match(api, /listXc1Npcs/);
  assert.match(migration, /CREATE TABLE `xc1_npcs`/);
  assert.match(migration, /FOREIGN KEY \(`quest_id`\) REFERENCES `quests`/);
});

test("includes the cross-checked Xenoblade 2 base game and DLC catalog", async () => {
  const source = await readFile(new URL("../data/xc2-quests.json", import.meta.url), "utf8");
  const quests = JSON.parse(source);
  const ids = new Set(quests.map((quest) => quest.id));
  const typeCounts = quests.reduce((counts, quest) => {
    counts[quest.type] = (counts[quest.type] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(quests.length, 493);
  assert.equal(ids.size, quests.length);
  assert.ok(quests.every((quest) => quest.game === "XC2"));
  assert.ok(quests.every((quest) => quest.status === "complete"));
  assert.ok(quests.every((quest) => quest.sourceUrl.startsWith("https://xenoblade2.cn/")));
  assert.ok(quests.every((quest) => quest.name && quest.region && quest.giver && quest.reward && quest.prerequisites));
  assert.ok(quests.every((quest) => quest.notes.startsWith("## ")));
  assert.ok(quests.some((quest) => quest.notes.includes("## 任务流程\n\n1. ")));
  const specialEvents = quests.filter((quest) => quest.type === "特殊事件");
  assert.ok(specialEvents.every((quest) => !/[{][|]|wikitable|\d+px|；===/.test(quest.notes)));
  assert.ok(specialEvents.every((quest) => !/缩略图|\]\]/.test(quest.notes)));
  const noponBrothers = specialEvents.find((quest) => quest.name === "诺彭十二兄弟");
  assert.match(noponBrothers.notes, /\| 名称 \| 地点 \|/);
  assert.match(noponBrothers.notes, /\| 卡瓦卡瓦 \| 古拉 · 上层 右半身 · 晚风草原 \|/);
  assert.match(noponBrothers.notes, /### 完成奖励/);
  const ardunRaising = specialEvents.find((quest) => quest.name === "角甲兽饲育");
  assert.match(ardunRaising.notes, /\| 等级 \| 名称 \| 达成数 \| 饵料 \| 所需道具 \| 达成数增加 \|/);
  assert.deepEqual(typeCounts, {
    "特殊事件": 9,
    "佣兵团任务": 274,
    "异刃任务": 32,
    "主线任务": 15,
    "普通任务": 163,
  });

  const baseGame = quests.filter((quest) => quest.chapter.startsWith("本篇 ·"));
  const expansionPass = quests.filter((quest) => quest.chapter.startsWith("扩展票 ·"));
  const torna = quests.filter((quest) => quest.chapter.startsWith("黄金之国伊拉 ·"));
  assert.equal(baseGame.length, 383);
  assert.equal(expansionPass.length, 52);
  assert.equal(torna.length, 58);
  assert.equal(torna.filter((quest) => quest.type === "主线任务").length, 6);
  assert.equal(torna.filter((quest) => quest.type === "普通任务").length, 52);

  const baseQuestSet = quests.filter((quest) => (
    !["佣兵团任务", "特殊事件"].includes(quest.type)
    && !quest.chapter.startsWith("黄金之国伊拉 ·")
  ));
  assert.equal(baseQuestSet.length, 152);
  assert.equal(baseQuestSet.filter((quest) => quest.chapter.startsWith("扩展票 ·")).length, 26);
  assert.equal(quests.filter((quest) => quest.type === "佣兵团任务" && quest.chapter.startsWith("扩展票 ·")).length, 26);

  assert.ok(quests.every((quest) => !quest.isTimed));
  assert.ok(quests.every((quest) => !quest.isExclusive));
  assert.ok(quests.every((quest) => !quest.exclusiveGroup && !quest.exclusiveRoute));
  const lingeringResentment = quests.find((quest) => quest.name === "余恨");
  assert.ok(lingeringResentment.chapter.startsWith("本篇 ·"));
  assert.match(lingeringResentment.notes, /Ver\.1\.4\.0 免费更新追加，并非扩展票任务/);
  assert.ok(expansionPass.every((quest) => quest.notes.includes("**内容归属**：扩展票")));
});

test("includes the cross-checked Xenoblade 3 base game and Future Redeemed catalog", async () => {
  const source = await readFile(new URL("../data/xc3-quests.json", import.meta.url), "utf8");
  const quests = JSON.parse(source);
  const ids = new Set(quests.map((quest) => quest.id));
  const typeCounts = Object.groupBy(quests, (quest) => quest.type);

  assert.equal(quests.length, 246);
  assert.equal(ids.size, quests.length);
  assert.ok(quests.every((quest) => quest.game === "XC3" && quest.status === "complete"));
  assert.ok(quests.every((quest) => (
    quest.name && quest.region && quest.giver && quest.reward && quest.prerequisites && quest.notes
  )));
  assert.ok(quests.every((quest) => quest.notes.includes("## 任务流程\n\n1. ")));
  assert.ok(quests.every((quest) => !quest.notes.includes("**推荐等级**：主来源未标注")));
  assert.ok(quests.every((quest) => !quest.isTimed && !quest.isExclusive));
  assert.ok(quests.every((quest) => !quest.exclusiveGroup && !quest.exclusiveRoute));

  assert.equal(typeCounts["主线剧情"].length, 12);
  assert.equal(typeCounts["英雄任务"].length, 42);
  assert.equal(typeCounts["普通任务"].length, 192);

  const baseGame = quests.filter((quest) => quest.chapter.startsWith("本篇 ·"));
  const expansionPass = quests.filter((quest) => quest.chapter.startsWith("扩展票 ·"));
  const futureRedeemed = quests.filter((quest) => quest.chapter.startsWith("崭新的未来 ·"));
  assert.equal(baseGame.length, 198);
  assert.equal(expansionPass.length, 6);
  assert.equal(futureRedeemed.length, 42);
  assert.equal(expansionPass.filter((quest) => quest.type === "英雄任务").length, 4);
  assert.equal(expansionPass.filter((quest) => quest.type === "普通任务").length, 2);
  assert.equal(futureRedeemed.filter((quest) => quest.type === "主线剧情").length, 5);
  assert.equal(futureRedeemed.filter((quest) => quest.type === "普通任务").length, 37);
  assert.ok(expansionPass.every((quest) => quest.notes.includes("**内容归属**：扩展票")));
  assert.ok(futureRedeemed.every((quest) => quest.notes.includes("**内容归属**：崭新的未来")));

  const primaryRecords = quests.filter((quest) => quest.name !== "让艾塞尔成长");
  assert.ok(primaryRecords.every((quest) => quest.sourceUrl.startsWith("https://xenoblade3.cn/")));
  const ethelGrowth = quests.find((quest) => quest.name === "让艾塞尔成长");
  assert.match(ethelGrowth.notes, /不会作为正式任务进入游戏任务日志/);
  assert.match(ethelGrowth.notes, /主站目录存在该项，但详情页返回404/);
  assert.match(ethelGrowth.prerequisites, /闪光击剑士与炼世士职阶均达到Rank 10/);
});

test("translates every internal XC1 story progress value used by the catalog", async () => {
  const { formatXC1StoryProgress, getXC1StoryNode } = await import("../lib/xc1-story-progress.ts");
  const quests = JSON.parse(await readFile(new URL("../data/xc1-quests.json", import.meta.url), "utf8"));
  const progressValues = new Set();

  for (const quest of quests) {
    for (const field of [quest.chapter, quest.prerequisites]) {
      for (const match of String(field).matchAll(/主线进度\s*(\d+)/g)) {
        progressValues.add(Number(match[1]));
      }
    }
  }

  assert.equal(progressValues.size, 27);
  assert.deepEqual([...progressValues].filter((progress) => !getXC1StoryNode(progress)), []);
  assert.equal(
    formatXC1StoryProgress("主线进度 158"),
    "第8章 · 初到皇都阿卡莫托（白翼宫受监视、与同伴交谈阶段）",
  );
  assert.equal(formatXC1StoryProgress("主线进度 999"), "主线进度 999");
});
