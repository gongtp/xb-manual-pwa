import { mkdtemp, mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Existing regression cases assert the checked-in personal records. Test a copy,
// never the database used by npm run dev (even when a test fails midway).
const folder = await mkdtemp(path.join(tmpdir(), "xeno-desktop-tests-"));
const database = path.join(folder, "archive.sqlite");
await mkdir("work", { recursive: true });
const source = new DatabaseSync("data/xeno-archive.sqlite", { readOnly: true });
try { source.prepare("VACUUM INTO ?").run(database); } finally { source.close(); }
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test",
  "tests/rendered-html.test.mjs", "tests/xc1-giver-migration.test.mjs", "tests/xc2-characters.test.mjs",
  "tests/xcx-quests.test.mjs", "tests/backup.test.mjs"], {
  stdio: "inherit", env: { ...process.env, SQLITE_DATABASE_PATH: database },
});
process.exitCode = result.status ?? 1;
