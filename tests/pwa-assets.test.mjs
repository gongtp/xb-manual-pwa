import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../dist-pwa/", import.meta.url);
const source = await readFile(new URL("sw.js", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));

function worker({ failDownload = false } = {}) {
  const listeners = {};
  const stores = new Map();
  const downloads = [];
  const messages = [];
  const cacheStorage = {
    keys: async () => [...stores.keys()],
    delete: async (key) => stores.delete(key),
    open: async (key) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const values = stores.get(key);
      return {
        put: async (request, response) => values.set(typeof request === "string" ? request : request.url, response.clone()),
        match: async (request) => values.get(typeof request === "string" ? request : request.url)?.clone(),
      };
    },
  };
  const origin = "https://example.test";
  vm.runInNewContext(source, {
    URL, Request, Response, caches: cacheStorage,
    fetch: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url);
      downloads.push(url.href);
      if (failDownload) throw new Error("offline");
      assert.ok(url.pathname.startsWith(manifest.scope));
      const relative = url.pathname.slice(manifest.scope.length);
      const bytes = await readFile(new URL(relative, root));
      return new Response(bytes);
    },
    self: {
      location: { href: `${origin}${manifest.scope}sw.js` },
      addEventListener: (name, callback) => { listeners[name] = callback; },
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (message) => messages.push(message) }] },
      skipWaiting: async () => {},
    },
  });
  async function event(name, extra = {}) {
    let pending;
    listeners[name]({ waitUntil: (promise) => { pending = promise; }, ...extra });
    await pending;
  }
  async function request(url, mode = "cors") {
    let response;
    listeners.fetch({ request: { method: "GET", mode, url }, respondWith: (value) => { response = value; } });
    return response;
  }
  return { event, request, stores, downloads, messages, origin };
}

test("PWA manifest and precache cover every published asset under the configured repository path", async () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, manifest.scope);
  const w = worker();
  await w.event("install");
  await w.event("activate");
  assert.ok(w.messages.some((m) => m.type === "CACHE_READY"));
  assert.ok(w.downloads.some((url) => url.endsWith("sql-wasm.wasm")));
  assert.ok(w.downloads.some((url) => url.includes("/images/xc2/")));
  const html = await (await w.request(`${w.origin}${manifest.scope}?offline=1`, "navigate")).text();
  assert.match(html, /异度资料库/);
  assert.ok(html.includes(`${manifest.scope}assets/`));
  const downloaded = w.downloads.length;
  for (const url of [...w.downloads]) assert.equal((await w.request(url)).status, 200);
  assert.equal(w.downloads.length, downloaded, "cached resources must not require the server");
  assert.equal(await w.request("https://external.test/"), undefined);
  assert.ok(w.downloads.every((url) => !/\.sqlite|backup|tests\//.test(url)));
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src.slice(manifest.scope.length), root));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("failed offline download cannot mark ready or destroy an older working cache", async () => {
  const w = worker({ failDownload: true });
  const old = `xeno-pwa:${manifest.scope}:old-version`;
  w.stores.set(old, new Map());
  await assert.rejects(w.event("install"), /offline/);
  assert.deepEqual([...w.stores.keys()], [old]);
  assert.ok(w.messages.some((m) => m.type === "CACHE_FAILED"));
  assert.ok(!w.messages.some((m) => m.type === "CACHE_READY"));
});

test("static output excludes private database files and server bundles", async () => {
  async function walk(dir) {
    const files = [];
    for (const name of await readdir(dir)) {
      const file = path.join(dir, name);
      if ((await stat(file)).isDirectory()) files.push(...await walk(file)); else files.push(file);
    }
    return files;
  }
  const files = await walk(fileURLToPath(root));
  assert.ok(files.every((file) => !/\.sqlite(?:-|$)|[/\\]server[/\\]|\.env$/.test(file)));
});
