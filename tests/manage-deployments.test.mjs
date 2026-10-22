import test from "node:test";
import assert from "node:assert/strict";
import { deleteOldDeployment, listDeployments } from "../scripts/manage-deployments.mjs";

test("active, pending and unknown deployments cannot be mutated", async () => {
  for (const state of ["success", "queued", "pending", "in_progress", undefined]) {
    const calls = [];
    const api = async (path, method = "GET") => {
      calls.push(method);
      return path.includes("statuses") ? (state ? [{ state }] : []) : { environment: "github-pages" };
    };
    await assert.rejects(deleteOldDeployment(api, 12));
    assert.ok(calls.every((method) => method === "GET"));
  }
});

test("failed records become inactive without affecting other deployments", async () => {
  const writes = [];
  let state = "failure";
  await deleteOldDeployment(async (path, method = "GET", body) => {
    if (method !== "GET") writes.push({ method, body });
    if (method === "POST") state = body.state;
    return path.includes("statuses") ? [{ state }] : { environment: "github-pages" };
  }, 12);
  assert.equal(writes[0].body.auto_inactive, false);
  assert.deepEqual(writes.map((w) => w.method), ["POST", "DELETE"]);
});

test("state changes during confirmation prevent deletion", async () => {
  let reads = 0;
  await assert.rejects(deleteOldDeployment(async (path, method = "GET") => {
    assert.equal(method, "GET");
    return path.includes("statuses") ? [{ state: ++reads === 1 ? "inactive" : "success" }] : { environment: "github-pages" };
  }, 12));
});

test("lists all pages, treats missing status as unknown", async () => {
  const records = await listDeployments(async (path) => {
    if (path.includes("statuses")) return [];
    return path.endsWith("page=1") ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, environment: "github-pages" })) : [{ id: 101, environment: "github-pages" }];
  });
  assert.equal(records.length, 101);
  assert.ok(records.every((d) => d.state === "unknown"));
});
