import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const characters = JSON.parse(await readFile(new URL("../data/xc2-characters.json", import.meta.url), "utf8"));
const quests = JSON.parse(await readFile(new URL("../data/xc2-quests.json", import.meta.url), "utf8"));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "xc2-character-test-"));
process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "progress.sqlite");
let handlerPromise;

async function request(init) {
  handlerPromise ??= import(new URL("../dist/server/index.js", import.meta.url).href).then((module) => module.default);
  return (await handlerPromise)(new Request("http://localhost/api/xc2-characters", init));
}

function patch(body) {
  return request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

after(async () => {
  globalThis.__xenoArchiveSqlite?.close();
  delete globalThis.__xenoArchiveSqlite;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("XC2 catalog separates Simplified Chinese cast, forms and game arcs", async () => {
  assert.equal(characters.length, 71);
  assert.equal(new Set(characters.map((item) => item.id)).size, characters.length);
  assert.equal(characters.filter((item) => item.kind === "driver" && item.arc === "baseGame").length, 7);
  assert.equal(characters.filter((item) => item.arc === "torna").length, 9);
  for (const name of ["莱克斯", "尼娅", "虎", "梅勒芙", "齐格"]) {
    assert.ok(characters.some((item) => item.name === name && item.kind === "driver" && item.arc === "baseGame" && item.collectible));
  }
  assert.ok(characters.some((item) => item.name === "尤格" && item.arc === "torna"));
  const guest = characters.find((item) => item.name === "真" && item.arc === "baseGame");
  assert.ok(guest.playable && !guest.collectible && /临时/.test(guest.acquisition));
  assert.ok(!characters.find((item) => item.name === "灭").collectible);
  assert.ok(characters.filter((item) => item.isForm).every((item) => !item.collectible));
  assert.equal(characters.filter((item) => item.acquisitionType === "newGamePlus").length, 7);
  assert.ok(!characters.some((item) => /M[. ]?O[. ]?M[. ]?O/i.test(item.name)));
  const byId = new Map(characters.map((item) => [item.id, item]));
  const questIds = new Set(quests.map((quest) => quest.id));
  for (const item of characters) {
    assert.ok(item.name && item.acquisition && item.description && item.sourceUrl.startsWith("https://"), item.id);
    assert.ok(item.partners.every((id) => byId.has(id) && (item.arc === "torna") === (byId.get(id).arc === "torna")), item.id);
    assert.ok(item.questIds.every((id) => questIds.has(id)), item.id);
    if (item.image) {
      assert.match(item.image, /^\/images\/xc2\/[\w.-]+$/);
      await access(new URL(`../public${item.image}`, import.meta.url));
    }
  }
});

test("XC2 collection and bookmarks persist independently and support forms correctly", async () => {
  const id = characters.find((item) => item.name === "焰" && item.arc === "baseGame").id;
  const formId = characters.find((item) => item.isForm).id;
  const initial = await request();
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual((await initial.json()).progress, []);
  assert.equal((await patch({ id, collected: true })).status, 200);
  assert.deepEqual((await (await patch({ id, bookmarked: true })).json()).progress, { id, collected: true, bookmarked: true });
  assert.deepEqual((await (await patch({ id, collected: false })).json()).progress, { id, collected: false, bookmarked: true });
  assert.deepEqual((await (await request()).json()).progress.find((item) => item.id === id), { id, collected: false, bookmarked: true });
  assert.equal((await patch({ id: formId, collected: true })).status, 400);
  assert.deepEqual((await (await patch({ id: formId, bookmarked: true })).json()).progress, { id: formId, collected: false, bookmarked: true });
});

test("XC2 personal blade quests and Torna battle data retain verified relationships", () => {
  const byName = (name) => characters.find((item) => item.name === name && item.arc === "baseGame");
  assert.deepEqual(byName("凛音").questIds, ["XC2-QUEST-B-19"]);
  for (const [name, id] of [["红莲", "XC2-QUEST-B-01"], ["七冰", "XC2-QUEST-B-16"], ["纽兹", "XC2-QUEST-B-17"]]) {
    assert.ok(byName(name).questIds.includes(id));
  }
  const linkedQuestIds = new Set(characters.flatMap((item) => item.questIds));
  const personalQuests = quests.filter((quest) => quest.type === "异刃任务");
  assert.equal(personalQuests.length, 32);
  assert.ok(personalQuests.every((quest) => linkedQuestIds.has(quest.id)));
  assert.equal(byName("大锤").statModifier, "最大HP20%");
  const tornaBlades = characters.filter((item) => item.kind === "blade" && item.arc === "torna");
  assert.ok(tornaBlades.every((item) => item.role && item.fieldSkills.length >= 2 && item.battleSkills.length === 3));
  assert.deepEqual(Object.fromEntries(tornaBlades.map((item) => [item.name, item.auxCores])), {
    真: 2, 霞: 3, 光: 2, 米诺奇: 3, 迦具土: 2, 绵津见: 2,
  });
});

test("XC2 progress API rejects malformed writes without changing saved records", async () => {
  const before = await (await request()).json();
  const id = characters[0].id;
  for (const body of [null, [], { id }, { id: "unknown", collected: true }, { id, collected: "false" }, { id, bookmarked: 1 }]) {
    assert.equal((await patch(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await request({ method: "PATCH", body: "{" })).status, 400);
  assert.deepEqual(await (await request()).json(), before);
});
