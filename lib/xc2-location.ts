import data from "../data/xc2-locations.json";
import { getQuestArc, type XC2Arc } from "./quest-filters";
import type { Quest } from "./quest";

export type XC2LocationKind = "landmark" | "location" | "secret" | "scene";
export type XC2Location = {
  id: string;
  regionId: string;
  name: string;
  area: string;
  floor: string;
  kind: XC2LocationKind;
  travel: boolean;
  discovery: boolean;
  rewards: { exp: number; sp: number; development: number };
  sourceUrl: string;
};
export type XC2Region = {
  id: string;
  name: string;
  arc: XC2Arc;
  order: number;
  chapter: string;
  description: string;
  caution: string;
  areas: string[];
  sourceUrl: string;
};
export type XC2LocationProgress = { id: string; visited: boolean; bookmarked: boolean };
export type XC2LocationView = {
  arc: "all" | XC2Arc;
  regionId: string;
  locationId: string;
  query: string;
  kind: "all" | XC2LocationKind;
  progress: "all" | "visited" | "unvisited" | "bookmarked";
};
export const initialXC2LocationView: XC2LocationView = {
  arc: "all", regionId: "XC2-REGION-ma02a", locationId: "", query: "", kind: "all", progress: "all",
};
export const xc2Directory = data as Omit<typeof data, "regions" | "locations"> & { regions: XC2Region[]; locations: XC2Location[] };
export const xc2LocationKinds: Record<XC2LocationKind, string> = { landmark: "地标", location: "地点", secret: "秘境", scene: "剧情场景" };
export const xc2LocationArcs: Record<XC2Arc, string> = { baseGame: "本篇", expansionPass: "扩展票", torna: "黄金之国伊拉" };
export const xc2RegionsById = new Map(xc2Directory.regions.map((region) => [region.id, region]));

export function matchesXC2Location(location: XC2Location, view: XC2LocationView, progress?: XC2LocationProgress) {
  const region = xc2RegionsById.get(location.regionId);
  if (!region || (view.arc !== "all" && region.arc !== view.arc)) return false;
  if (view.regionId !== "all" && view.regionId !== region.id) return false;
  if (view.kind !== "all" && view.kind !== location.kind) return false;
  if (view.progress === "visited" && !progress?.visited) return false;
  if (view.progress === "unvisited" && progress?.visited) return false;
  if (view.progress === "bookmarked" && !progress?.bookmarked) return false;
  const text = [region.name, xc2LocationArcs[region.arc], region.chapter, location.name, location.area, location.floor].join(" ").normalize("NFKC").toLowerCase();
  return view.query.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.includes(term));
}

export function questsMentioningXC2Location(quests: Quest[], location: XC2Location) {
  const region = xc2RegionsById.get(location.regionId);
  if (!region || location.name.length < 3 || location.kind === "scene") return [];
  return quests.filter((quest) => {
    if (quest.game !== "XC2" || quest.type === "佣兵团任务") return false;
    const arc = getQuestArc(quest);
    if (!arc || (arc === "torna") !== (region.arc === "torna")) return false;
    // A textual mention is a useful cross-reference, not an inferred quest start point.
    return [quest.region, quest.giver, quest.prerequisites, quest.notes].some((text) => text.includes(location.name));
  });
}
