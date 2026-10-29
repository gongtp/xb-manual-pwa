import { getSqlite } from ".";
import type { XC3LocationProgress } from "../lib/xc3-location";

async function ensureProgressTable() {
  await getSqlite().prepare(`CREATE TABLE IF NOT EXISTS xc3_location_progress (
    location_id TEXT PRIMARY KEY NOT NULL,
    visited INTEGER NOT NULL DEFAULT 0 CHECK (visited IN (0, 1)),
    bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1))
  )`).run();
}

export async function listXC3LocationProgress(): Promise<XC3LocationProgress[]> {
  await ensureProgressTable();
  const rows = await getSqlite().prepare("SELECT * FROM xc3_location_progress").all<{
    location_id: string; visited: number; bookmarked: number;
  }>();
  return rows.results.map((row) => ({ id: row.location_id, visited: Boolean(row.visited), bookmarked: Boolean(row.bookmarked) }));
}

export async function saveXC3LocationProgress(id: string, patch: { visited?: boolean; bookmarked?: boolean }) {
  await ensureProgressTable();
  // Update only the supplied field so separate bookmark/exploration changes cannot
  // overwrite one another with stale client state.
  await getSqlite().prepare(`INSERT INTO xc3_location_progress (location_id, visited, bookmarked)
    VALUES (?, ?, ?) ON CONFLICT(location_id) DO UPDATE SET
    visited = CASE WHEN ? THEN excluded.visited ELSE visited END,
    bookmarked = CASE WHEN ? THEN excluded.bookmarked ELSE bookmarked END`)
    .bind(id, Number(patch.visited ?? false), Number(patch.bookmarked ?? false),
      Number(patch.visited !== undefined), Number(patch.bookmarked !== undefined)).run();
  const row = await getSqlite().prepare("SELECT visited, bookmarked FROM xc3_location_progress WHERE location_id = ?")
    .bind(id).first<{ visited: number; bookmarked: number }>();
  return { id, visited: Boolean(row?.visited), bookmarked: Boolean(row?.bookmarked) };
}
