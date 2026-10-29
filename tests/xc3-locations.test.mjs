import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = JSON.parse(await readFile(new URL("../data/xc3-locations.json", import.meta.url), "utf8"));

test("XC3 directory has unique records, valid regions and explicit unverified types", () => {
  assert.equal(new Set(directory.locations.map((p) => p.id)).size, directory.locations.length);
  for (const place of directory.locations) {
    assert.ok(directory.regions.some((r) => r.id === place.regionId));
    assert.ok(place.name && place.area && place.sourceUrl.startsWith("https://"));
    if (place.kind === "reference") assert.equal(place.travel, false);
  }
  assert.equal(directory.locations.filter((p) => p.name === "纪念堂").length, 1);
  assert.equal(directory.regions.find((r) => r.id === directory.locations.find((p) => p.name === "纪念堂").regionId).name, "都市");
  assert.deepEqual([...new Set(directory.regions.map((r) => r.arc))], ["baseGame", "futureRedeemed"]);
});

test("XC3 exploration API persists independent fields and rejects invalid IDs", async () => {
  process.env.SQLITE_DATABASE_PATH = path.join(await mkdtemp(path.join(tmpdir(), "xc3-places-")), "test.sqlite");
  const handler = (await import("../dist/server/index.js")).default;
  const call = (method, body) => handler(new Request("http://localhost/api/xc3-locations", { method, headers: {"Content-Type":"application/json"}, body: body === undefined ? undefined : JSON.stringify(body) }));
  const id = directory.locations[0].id;
  assert.equal((await call("PATCH", { id, visited: true })).status, 200);
  assert.equal((await call("PATCH", { id, bookmarked: true })).status, 200);
  const saved = await (await call("GET")).json();
  assert.deepEqual(saved.progress.find((p) => p.id === id), { id, visited: true, bookmarked: true });
  assert.equal((await call("PATCH", { id: "invalid", visited: true })).status, 400);
  assert.equal((await call("PATCH", { id, visited: "true" })).status, 400);
});
