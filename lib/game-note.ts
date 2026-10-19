import { isGameCode, type GameCode } from "./quest";

export const gameNoteCategories = ["重点提醒", "战斗", "养成", "探索", "收集", "其他"] as const;

export type GameNoteCategory = typeof gameNoteCategories[number];

export type GameNote = {
  id: string;
  game: GameCode;
  title: string;
  category: string;
  content: string;
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "是"].includes(String(value ?? "").trim().toLowerCase());
}

export function normalizeGameNote(value: unknown, fallbackId = ""): GameNote | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const game = record.game;
  const title = String(record.title ?? "").trim();
  const id = String(record.id ?? fallbackId).trim();
  if (!id || !title || !isGameCode(game)) return null;

  const now = new Date().toISOString();
  const sortOrderValue = Number(record.sortOrder ?? record.sort_order ?? 0);
  return {
    id,
    game,
    title,
    category: String(record.category ?? "其他").trim() || "其他",
    content: String(record.content ?? ""),
    isPinned: normalizeBoolean(record.isPinned ?? record.is_pinned),
    sortOrder: Number.isFinite(sortOrderValue) ? Math.trunc(sortOrderValue) : 0,
    createdAt: String(record.createdAt ?? record.created_at ?? now),
    updatedAt: String(record.updatedAt ?? record.updated_at ?? now),
  };
}

export function emptyGameNote(game: GameCode): GameNote {
  const now = new Date().toISOString();
  return {
    id: "",
    game,
    title: "",
    category: "重点提醒",
    content: "",
    isPinned: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}
