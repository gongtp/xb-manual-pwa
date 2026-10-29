import type { GameCode, QualityStatus, Quest } from "./quest";

export type XC1Arc = "main" | "futureConnected";
export type XC2Arc = "baseGame" | "expansionPass" | "torna";
export type XC3Arc = "baseGame" | "expansionPass" | "futureRedeemed";
export type QuestArc = XC1Arc | XC2Arc | XC3Arc | "definitiveEdition";
export type QuestArcFilter = "all" | QuestArc;
export type XC1ArcFilter = "all" | XC1Arc;
export type BinaryQuestFilter = "all" | "yes" | "no";
export type MarkerFilter = "all" | "unmarked" | string;
export type QuestFilterDimension = "marker" | "type" | "arc" | "timed" | "exclusive" | "region";

export type QuestFilterState = {
  game: GameCode;
  status: "all" | QualityStatus;
  marker: MarkerFilter;
  type: string;
  arc: QuestArcFilter;
  timed: BinaryQuestFilter;
  exclusive: BinaryQuestFilter;
  region: string;
  query: string;
};

export function getXC1Arc(chapter: string): XC1Arc | null {
  const normalized = chapter.trim();
  if (normalized.startsWith("相连的未来")) return "futureConnected";
  if (normalized.startsWith("本篇")) return "main";
  return null;
}

export function getQuestArc(quest: Pick<Quest, "game" | "chapter">): QuestArc | null {
  if (quest.game === "XC1") return getXC1Arc(quest.chapter);
  if (quest.game === "XCX") return quest.chapter.trim().startsWith("终极版") ? "definitiveEdition" : null;
  const normalized = quest.chapter.trim();
  if (quest.game === "XC2" && normalized.startsWith("黄金之国伊拉")) return "torna";
  if (quest.game === "XC3" && normalized.startsWith("崭新的未来")) return "futureRedeemed";
  if (normalized.startsWith("扩展票")) return "expansionPass";
  if (normalized.startsWith("本篇")) return "baseGame";
  return null;
}

export function questMatchesFilters(
  quest: Quest,
  filters: QuestFilterState,
  omitted?: QuestFilterDimension,
) {
  if (quest.game !== filters.game) return false;
  if (filters.status !== "all" && quest.status !== filters.status) return false;
  if (omitted !== "marker" && filters.marker !== "all") {
    const markerMatch = filters.marker === "unmarked"
      ? !quest.markerId
      : quest.markerId === filters.marker;
    if (!markerMatch) return false;
  }
  if (omitted !== "type" && filters.type !== "all") {
    const matchesType = (filters.game === "XC2" && filters.type === "xc2-expansion-pass") || (filters.game === "XC3" && filters.type === "xc3-expansion-pass")
      ? getQuestArc(quest) === "expansionPass"
      : quest.type === filters.type;
    if (!matchesType) return false;
  }
  if (omitted !== "arc" && filters.arc !== "all") {
    const arc = getQuestArc(quest);
    const matchesArc = filters.game === "XC2" && filters.arc === "baseGame"
      ? arc !== "torna"
      : filters.game === "XC3" && filters.arc === "baseGame"
        ? arc === "baseGame" || arc === "expansionPass"
        : arc === filters.arc;
    if (!matchesArc) return false;
  }
  if (omitted !== "timed" && filters.timed !== "all" && quest.isTimed !== (filters.timed === "yes")) return false;
  if (omitted !== "exclusive" && filters.exclusive !== "all" && quest.isExclusive !== (filters.exclusive === "yes")) return false;
  if (omitted !== "region" && filters.region !== "all" && quest.region !== filters.region) return false;
  const needle = filters.query.trim().toLowerCase();
  const searchable = quest.game === "XCX"
    ? [quest.id, quest.name, quest.giver, quest.region, quest.prerequisites, quest.notes]
    : [quest.id, quest.name];
  return !needle || searchable.join(" ").toLowerCase().includes(needle);
}
