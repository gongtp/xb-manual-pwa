export type GameCode = "XC1" | "XC2" | "XC3" | "XCX";
export type QualityStatus = "complete" | "incomplete" | "pending" | "conflict";

export type Quest = {
  id: string;
  game: GameCode;
  name: string;
  type: string;
  chapter: string;
  region: string;
  giver: string;
  reward: string;
  prerequisites: string;
  source: string;
  sourceUrl: string;
  status: QualityStatus;
  markerId: string;
  isTimed: boolean;
  isExclusive: boolean;
  exclusiveGroup: string;
  exclusiveRoute: string;
  manualNotes: string;
  notes: string;
  updatedAt: string;
};

export type QuestLabel = {
  id: string;
  game: GameCode;
  name: string;
  color: string;
  isBuiltIn: boolean;
  sortOrder: number;
  createdAt: string;
};

export const gameNames: Record<GameCode, string> = {
  XC1: "异度神剑 1",
  XC2: "异度神剑 2",
  XC3: "异度神剑 3",
  XCX: "异度神剑 X",
};

export const questTypesByGame: Record<GameCode, string[]> = {
  XC1: ["支线任务", "剧情任务", "突发任务"],
  XC2: ["主线任务", "普通任务", "异刃任务", "佣兵团任务", "特殊事件"],
  XC3: ["主线剧情", "英雄任务", "普通任务"],
  XCX: ["剧情任务", "牵绊任务", "普通任务", "简易任务"],
};

export const statusMeta: Record<QualityStatus, { label: string; short: string }> = {
  complete: { label: "资料完整", short: "完整" },
  incomplete: { label: "缺少字段", short: "缺漏" },
  pending: { label: "待人工核验", short: "待核验" },
  conflict: { label: "来源冲突", short: "冲突" },
};

export const qualityStatuses = Object.keys(statusMeta) as QualityStatus[];
export const gameCodes = Object.keys(gameNames) as GameCode[];

export function supportsQuestRiskFlags(game: GameCode) {
  return game === "XC1" || game === "XCX";
}

export function isGameCode(value: unknown): value is GameCode {
  return typeof value === "string" && gameCodes.includes(value as GameCode);
}

export function isQualityStatus(value: unknown): value is QualityStatus {
  return typeof value === "string" && qualityStatuses.includes(value as QualityStatus);
}
