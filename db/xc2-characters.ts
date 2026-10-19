import { getSqlite } from ".";
import type { XC2CharacterProgress } from "../lib/xc2-character";

async function ensureProgressTable() {
  await getSqlite().prepare(`CREATE TABLE IF NOT EXISTS xc2_character_progress (
    character_id TEXT PRIMARY KEY NOT NULL,
    collected INTEGER NOT NULL DEFAULT 0 CHECK (collected IN (0, 1)),
    bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1))
  )`).run();
}

export async function listXC2CharacterProgress(): Promise<XC2CharacterProgress[]> {
  await ensureProgressTable();
  const rows = await getSqlite().prepare("SELECT character_id, collected, bookmarked FROM xc2_character_progress")
    .all<{ character_id: string; collected: number; bookmarked: number }>();
  return rows.results.map((row) => ({
    id: row.character_id, collected: Boolean(row.collected), bookmarked: Boolean(row.bookmarked),
  }));
}

export async function saveXC2CharacterProgress(id: string, patch: { collected?: boolean; bookmarked?: boolean }): Promise<XC2CharacterProgress> {
  await ensureProgressTable();
  // Independent updates preserve a concurrent change to the other progress field.
  await getSqlite().prepare(`INSERT INTO xc2_character_progress (character_id, collected, bookmarked)
    VALUES (?, ?, ?) ON CONFLICT(character_id) DO UPDATE SET
    collected = CASE WHEN ? THEN excluded.collected ELSE collected END,
    bookmarked = CASE WHEN ? THEN excluded.bookmarked ELSE bookmarked END`)
    .bind(id, Number(patch.collected ?? false), Number(patch.bookmarked ?? false),
      Number(patch.collected !== undefined), Number(patch.bookmarked !== undefined)).run();
  const row = await getSqlite().prepare("SELECT collected, bookmarked FROM xc2_character_progress WHERE character_id = ?")
    .bind(id).first<{ collected: number; bookmarked: number }>();
  return { id, collected: Boolean(row?.collected), bookmarked: Boolean(row?.bookmarked) };
}
