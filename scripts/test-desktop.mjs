import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Initialize from public seed data in a fresh temporary database.
// Never read or modify the database used by npm run dev.
const folder = await mkdtemp(path.join(tmpdir(), "xeno-desktop-tests-"));
const database = path.join(folder, "archive.sqlite");
await mkdir("work", { recursive: true });
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test",
  "tests/rendered-html.test.mjs", "tests/xc1-giver-migration.test.mjs", "tests/xc2-characters.test.mjs",
  "tests/xcx-quests.test.mjs", "tests/backup.test.mjs", "tests/xc3-locations.test.mjs"], {
  stdio: "inherit", env: { ...process.env, SQLITE_DATABASE_PATH: database },
});
process.exitCode = result.status ?? 1;
