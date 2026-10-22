import test from "node:test";
import assert from "node:assert/strict";
import { classifyDeployments, deleteOldDeployment, listDeployments } from "../scripts/manage-deployments.mjs";

const oldTime = "2026-10-20T01:44:30Z";
const newTime = "2026-10-22T09:27:54Z";
function mockApi(initial, onRead) {
  const records = structuredClone(initial);
  const writes = [];
  let reads = 0;
  const api = async (path, method = "GET", body) => {
    const id = Number(path.match(/deployments\/(\d+)/)?.[1]);
    if (method !== "GET") {
      writes.push({ id, method, body });
      if (method === "POST") records.find((d) => d.id === id).state = body.state;
      return null;
    }
    if (path.includes("statuses")) {
      const d = records.find((d) => d.id === id);
      return d.state ? [{ state: d.state, created_at: d.statusCreatedAt }] : [];
    }
    onRead?.(records, ++reads);
    return records.map((d) => ({ ...d, environment: "github-pages" }));
  };
  return { api, writes };
}
const record = (id, state, statusCreatedAt = oldTime) => ({ id, state, statusCreatedAt });

test("old successful record is deletable while latest success is protected", async () => {
  const { api } = mockApi([record(12, "success"), record(13, "success", newTime)]);
  const rows = await listDeployments(api);
  assert.equal(rows[0].canDelete, true);
  assert.equal(rows[1].canDelete, false);
  assert.equal(rows[1].current, true);
});

test("latest success, running, waiting and unknown cannot be mutated", async () => {
  for (const state of ["success", "queued", "pending", "waiting", "in_progress", undefined]) {
    const { api, writes } = mockApi([record(12, state)]);
    await assert.rejects(deleteOldDeployment(api, 12));
    assert.equal(writes.length, 0);
  }
});

test("old successes and failures are deactivated without affecting current deployment", async () => {
  for (const state of ["success", "failure", "error", "inactive"]) {
    const { api, writes } = mockApi([record(12, state), record(13, "success", newTime)]);
    await deleteOldDeployment(api, 12);
    assert.ok(writes.every((w) => w.id === 12));
    assert.deepEqual(writes.map((w) => w.method), state === "inactive" ? ["DELETE"] : ["POST", "DELETE"]);
    if (state !== "inactive") assert.equal(writes[0].body.auto_inactive, false);
  }
});

test("latest failed run does not unprotect previous successful deployment", () => {
  const rows = classifyDeployments([record(12, "success"), record(13, "failure", newTime)]);
  assert.equal(rows[0].canDelete, false);
  assert.equal(rows[1].canDelete, true);
});

test("completion time rather than creation order protects a redeployed old run", () => {
  const rows = classifyDeployments([record(13, "success"), record(12, "success", newTime)]);
  assert.equal(rows[1].current, true);
  assert.equal(rows[0].canDelete, true);
});

test("ambiguous or missing success timestamps are protected", () => {
  for (const time of [newTime, undefined, "invalid"]) {
    const rows = classifyDeployments([record(12, "success", newTime), { id: 13, state: "success", statusCreatedAt: time }]);
    assert.ok(rows.every((d) => !d.canDelete));
  }
});

test("confirmation refresh protects an old record that became current", async () => {
  const { api, writes } = mockApi([record(12, "success"), record(13, "success", newTime)], (rows) => {
    rows[0].statusCreatedAt = "2026-10-23T00:00:00Z";
  });
  await assert.rejects(deleteOldDeployment(api, 12));
  assert.equal(writes.length, 0);
});

test("reactivated record cannot be deleted after deactivation", async () => {
  const { api, writes } = mockApi([record(12, "success"), record(13, "success", newTime)], (rows, reads) => {
    if (reads === 2) { rows[0].state = "success"; rows[0].statusCreatedAt = "2026-10-23T00:00:00Z"; }
  });
  await assert.rejects(deleteOldDeployment(api, 12));
  assert.deepEqual(writes.map((w) => w.method), ["POST"]);
});

test("lists all pages and protects missing statuses", async () => {
  const rows = await listDeployments(async (path) => {
    if (path.includes("statuses")) return [];
    return path.endsWith("page=1") ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, environment: "github-pages" })) : [{ id: 101, environment: "github-pages" }];
  });
  assert.equal(rows.length, 101);
  assert.ok(rows.every((d) => d.state === "unknown" && !d.canDelete));
});
