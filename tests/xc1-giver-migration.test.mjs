import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("XC1 giver migration preserves personal fields and later edits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "xc1-giver-migration-"));
  const code = `
    import assert from 'node:assert/strict';
    import { DatabaseSync } from 'node:sqlite';
    import { readdir, readFile } from 'node:fs/promises';
    const db = new DatabaseSync(process.env.SQLITE_DATABASE_PATH);
    for (const file of (await readdir('drizzle')).filter(file=>file.endsWith('.sql')).sort()) {
      db.exec(await readFile('drizzle/'+file,'utf8'));
    }
    const handler = (await import('./dist/server/index.js')).default;
    const request = (url) => handler(new Request('http://localhost'+url));
    const labels = await request('/api/quest-labels'); assert.equal(labels.status, 200, await labels.text());
    const first = await request('/api/quests'); assert.equal(first.status, 200, await first.text());
    db.prepare("DELETE FROM app_metadata WHERE key = 'xc1_giver_corrections_2026_10_01'").run();
    const oldGivers = [['XC1-Q-0165','梅酱酱'],['XC1-Q-0175','安·银'],['XC1-Q-0176','帕痞']];
    for (const [id,giver] of oldGivers) db.prepare("UPDATE quests SET giver=?, manual_notes='我的备注', notes='已有资料', status='pending', updated_at='2026-01-01' WHERE id=?").run(giver,id);
    const before = db.prepare('SELECT * FROM quests ORDER BY id').all();
    const payload = await (await request('/api/quests')).json();
    assert.equal(payload.quests.length,1890);
    const expected = new Map([['XC1-Q-0165','莓酱酱'],['XC1-Q-0175','簪·银'],['XC1-Q-0176','欧尔克霍古']]);
    for (const row of before) {
      const actual = db.prepare('SELECT * FROM quests WHERE id=?').get(row.id);
      if (!expected.has(row.id)) { assert.deepEqual(actual,row); continue; }
      assert.equal(actual.giver,expected.get(row.id));
      assert.ok(actual.notes.startsWith('已有资料；委托人分支：'));
      for (const key of Object.keys(row)) if (!['giver','notes','updated_at'].includes(key)) assert.equal(actual[key],row[key]);
    }
    const once = db.prepare('SELECT * FROM quests ORDER BY id').all();
    await request('/api/quests');
    assert.deepEqual(db.prepare('SELECT * FROM quests ORDER BY id').all(),once);
    db.prepare("UPDATE quests SET giver='我的自定义委托人', notes='我的资料编辑' WHERE id='XC1-Q-0175'").run();
    await request('/api/quests');
    assert.equal(db.prepare("SELECT giver FROM quests WHERE id='XC1-Q-0175'").get().giver,'我的自定义委托人');
    db.prepare("DELETE FROM app_metadata WHERE key='xc1_giver_corrections_2026_10_01'").run();
    await request('/api/quests');
    assert.equal(db.prepare("SELECT notes FROM quests WHERE id='XC1-Q-0175'").get().notes,'我的资料编辑');
    const npcs = await (await request('/api/xc1-npcs')).json();
    assert.equal(npcs.npcs.length,176);
    assert.equal(npcs.npcs.flatMap(n=>n.questIds).length,326);
    assert.deepEqual(npcs.npcs.filter(n=>n.questIds.includes('XC1-Q-0176')).map(n=>n.name),['欧尔克霍古']);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    db.close();
  `;
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, SQLITE_DATABASE_PATH: path.join(directory, "archive.sqlite") },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("xc1-giver-migration-"));
    await rm(directory, { recursive: true, force: true });
  }
});
