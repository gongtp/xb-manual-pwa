import { getSqlite, type SqlitePreparedStatement } from ".";
import { isGameCode, type GameCode, type QuestLabel } from "../lib/quest";

type QuestLabelRow = {
  id: string;
  game: GameCode;
  name: string;
  color: string;
  is_built_in: number;
  sort_order: number;
  created_at: string;
};

const createTableSql = `CREATE TABLE IF NOT EXISTS quest_labels (
  id TEXT PRIMARY KEY NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('XC1', 'XC2', 'XC3', 'XCX')),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0 CHECK (is_built_in IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`;

const builtInLabels: QuestLabel[] = [
  {
    id: "XC1-MARK-INCOMPLETE",
    game: "XC1",
    name: "未完成",
    color: "#C47A18",
    isBuiltIn: true,
    sortOrder: 10,
    createdAt: "2026-08-06T00:00:00.000Z",
  },
  {
    id: "XC1-MARK-COMPLETE",
    game: "XC1",
    name: "已完成",
    color: "#138A78",
    isBuiltIn: true,
    sortOrder: 20,
    createdAt: "2026-08-06T00:00:00.000Z",
  },
];

const xcxBuiltInLabels: QuestLabel[] = ["未完成", "已完成"].map((name, index) => ({
  id: `XCX-MARK-${index ? "COMPLETE" : "INCOMPLETE"}`,
  game: "XCX",
  name,
  color: index ? "#138A78" : "#C47A18",
  isBuiltIn: true,
  sortOrder: (index + 1) * 10,
  createdAt: "2026-10-18T00:00:00.000Z",
}));

const customColorPalette = [
  "#6D5BD0", "#2F75B5", "#B44C86", "#3F8C5A", "#B45742", "#7C5AA6",
  "#237D8B", "#A65C28", "#4766B1", "#8B6D1F", "#B23A68", "#397A6B",
  "#8056A8", "#2D728F", "#A64B3C", "#5D7A35", "#7B5CBA", "#AA526E",
];

function rowToQuestLabel(row: QuestLabelRow): QuestLabel {
  return {
    id: row.id,
    game: row.game,
    name: row.name,
    color: row.color,
    isBuiltIn: Boolean(row.is_built_in),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function bindQuestLabel(statement: SqlitePreparedStatement, label: QuestLabel) {
  return statement.bind(
    label.id,
    label.game,
    label.name,
    label.color,
    label.isBuiltIn ? 1 : 0,
    label.sortOrder,
    label.createdAt,
  );
}

function randomIndex(length: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function componentToHex(value: number) {
  return Math.round(value * 255).toString(16).padStart(2, "0").toUpperCase();
}

function hslToHex(hue: number, saturation = 0.52, lightness = 0.42) {
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    return lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${componentToHex(channel(0))}${componentToHex(channel(8))}${componentToHex(channel(4))}`;
}

async function nextUniqueColor() {
  const result = await getSqlite().prepare("SELECT color FROM quest_labels").all<{ color: string }>();
  const used = new Set(result.results.map((row) => row.color.toUpperCase()));
  const available = customColorPalette.filter((color) => !used.has(color));
  if (available.length) return available[randomIndex(available.length)];

  for (let attempt = 0; attempt < 720; attempt += 1) {
    const color = hslToHex(randomIndex(360));
    if (!used.has(color)) return color;
  }
  throw new Error("暂时无法分配新的标签颜色，请稍后重试");
}

export async function ensureQuestLabelDatabase() {
  const database = getSqlite();
  await database.prepare(createTableSql).run();
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS quest_labels_game_name_unique ON quest_labels(game, name)").run();
  const insert = database.prepare(`INSERT OR IGNORE INTO quest_labels (
    id, game, name, color, is_built_in, sort_order, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  await database.batch([...builtInLabels, ...xcxBuiltInLabels].map((label) => bindQuestLabel(insert, label)));
}

export async function listQuestLabels(game?: GameCode) {
  await ensureQuestLabelDatabase();
  const result = game
    ? await getSqlite().prepare(`SELECT * FROM quest_labels WHERE game = ?
        ORDER BY is_built_in DESC, sort_order ASC, created_at ASC`).bind(game).all<QuestLabelRow>()
    : await getSqlite().prepare(`SELECT * FROM quest_labels
        ORDER BY CASE game WHEN 'XC1' THEN 1 WHEN 'XC2' THEN 2 WHEN 'XC3' THEN 3 ELSE 4 END,
        is_built_in DESC, sort_order ASC, created_at ASC`).all<QuestLabelRow>();
  return result.results.map(rowToQuestLabel);
}

export async function getQuestLabel(id: string) {
  await ensureQuestLabelDatabase();
  const row = await getSqlite().prepare("SELECT * FROM quest_labels WHERE id = ?")
    .bind(id.trim())
    .first<QuestLabelRow>();
  return row ? rowToQuestLabel(row) : null;
}

export async function createQuestLabel(gameValue: unknown, nameValue: unknown) {
  if (!isGameCode(gameValue)) throw new Error("标签所属游戏无效");
  const name = String(nameValue ?? "").trim();
  if (!name) throw new Error("请输入标签名称");
  if (name.length > 20) throw new Error("标签名称不能超过 20 个字符");

  await ensureQuestLabelDatabase();
  const existing = await getSqlite().prepare("SELECT id FROM quest_labels WHERE game = ? AND lower(name) = lower(?)")
    .bind(gameValue, name)
    .first<{ id: string }>();
  if (existing) throw new Error("这个标签已经存在");

  const labels = await listQuestLabels(gameValue);
  const label: QuestLabel = {
    id: `QUEST-LABEL-${crypto.randomUUID()}`,
    game: gameValue,
    name,
    color: await nextUniqueColor(),
    isBuiltIn: false,
    sortOrder: Math.max(100, ...labels.map((item) => item.sortOrder + 10)),
    createdAt: new Date().toISOString(),
  };
  const insert = getSqlite().prepare(`INSERT INTO quest_labels (
    id, game, name, color, is_built_in, sort_order, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  await bindQuestLabel(insert, label).run();
  return label;
}

export async function deleteQuestLabel(idValue: unknown) {
  await ensureQuestLabelDatabase();
  const id = String(idValue ?? "").trim();
  if (!id) throw new Error("标签编号不能为空");

  const label = await getSqlite().prepare("SELECT * FROM quest_labels WHERE id = ?")
    .bind(id)
    .first<QuestLabelRow>();
  if (!label) throw new Error("标签不存在");
  if (label.is_built_in) throw new Error("内置标签不能删除");

  const usage = await getSqlite().prepare("SELECT COUNT(*) AS count FROM quests WHERE marker_id = ?")
    .bind(id)
    .first<{ count: number }>();
  if (usage?.count) throw new Error(`这个标签正在被 ${usage.count} 个任务使用，请先取消这些任务的标记`);

  const result = await getSqlite().prepare(`DELETE FROM quest_labels
    WHERE id = ? AND is_built_in = 0
    AND NOT EXISTS (SELECT 1 FROM quests WHERE marker_id = quest_labels.id)`)
    .bind(id)
    .run();
  if (!result.meta.changes) throw new Error("标签正在被任务使用，暂时不能删除");
  return rowToQuestLabel(label);
}
