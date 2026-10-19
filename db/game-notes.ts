import { initialGameNotes } from "../data/game-notes";
import { normalizeGameNote, type GameNote } from "../lib/game-note";
import type { GameCode } from "../lib/quest";
import { getSqlite, type SqlitePreparedStatement } from ".";

type GameNoteRow = {
  id: string;
  game: GameCode;
  title: string;
  category: string;
  content: string;
  is_pinned: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const createTableSql = `CREATE TABLE IF NOT EXISTS game_notes (
  id TEXT PRIMARY KEY NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('XC1', 'XC2', 'XC3', 'XCX')),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  content TEXT NOT NULL DEFAULT '',
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const upsertSql = `INSERT INTO game_notes (
  id, game, title, category, content, is_pinned, sort_order, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  game = excluded.game,
  title = excluded.title,
  category = excluded.category,
  content = excluded.content,
  is_pinned = excluded.is_pinned,
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at`;

function rowToGameNote(row: GameNoteRow): GameNote {
  return {
    id: row.id,
    game: row.game,
    title: row.title,
    category: row.category,
    content: row.content,
    isPinned: Boolean(row.is_pinned),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bindGameNote(statement: SqlitePreparedStatement, note: GameNote) {
  return statement.bind(
    note.id,
    note.game,
    note.title,
    note.category,
    note.content,
    note.isPinned ? 1 : 0,
    note.sortOrder,
    note.createdAt,
    note.updatedAt,
  );
}

export async function ensureGameNotesDatabase() {
  const database = getSqlite();
  await database.prepare(createTableSql).run();
  await database.batch([
    database.prepare("CREATE INDEX IF NOT EXISTS game_notes_game_idx ON game_notes(game)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`),
  ]);
  const seedMarker = await database.prepare("SELECT value FROM app_metadata WHERE key = 'game_notes_seed_v1'").first();
  const insertSeed = database.prepare(`INSERT OR IGNORE INTO game_notes (
    id, game, title, category, content, is_pinned, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  if (!seedMarker) {
    await database.batch([
      ...initialGameNotes.map((note) => bindGameNote(insertSeed, note)),
      database.prepare("INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('game_notes_seed_v1', '1')"),
    ]);
  }

  const contentSeedMarker = await database.prepare("SELECT value FROM app_metadata WHERE key = 'game_notes_content_seed_v3'").first();
  if (contentSeedMarker) return;
  await database.batch([
    ...initialGameNotes.map((note) => bindGameNote(insertSeed, note)),
    database.prepare("INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('game_notes_content_seed_v3', '1')"),
  ]);
}

export async function listGameNotes(game?: GameCode) {
  await ensureGameNotesDatabase();
  const result = game
    ? await getSqlite().prepare(`SELECT * FROM game_notes WHERE game = ?
        ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC`).bind(game).all<GameNoteRow>()
    : await getSqlite().prepare(`SELECT * FROM game_notes
        ORDER BY CASE game WHEN 'XC1' THEN 1 WHEN 'XC2' THEN 2 ELSE 3 END,
        is_pinned DESC, sort_order ASC, updated_at DESC`).all<GameNoteRow>();
  return result.results.map(rowToGameNote);
}

export async function saveGameNote(value: unknown) {
  await ensureGameNotesDatabase();
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = String(record.id ?? "").trim() || crypto.randomUUID();
  const note = normalizeGameNote({ ...record, id });
  if (!note) throw new Error("所属游戏或笔记标题无效");

  const existing = await getSqlite().prepare("SELECT created_at FROM game_notes WHERE id = ?")
    .bind(note.id)
    .first<{ created_at: string }>();
  const saved = {
    ...note,
    createdAt: existing?.created_at ?? note.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await bindGameNote(getSqlite().prepare(upsertSql), saved).run();
  return saved;
}

export async function deleteGameNote(id: string) {
  await ensureGameNotesDatabase();
  if (!id.trim()) throw new Error("缺少要删除的笔记编号");
  await getSqlite().prepare("DELETE FROM game_notes WHERE id = ?").bind(id.trim()).run();
}
