import data from "../data/xc3-locations.json";
import { getQuestArc } from "./quest-filters";
import type { Quest } from "./quest";

export type XC3LocationKind = "landmark" | "location" | "secret" | "rest" | "area" | "colony" | "reference";
export type XC3LocationArc = "baseGame" | "futureRedeemed";
export type XC3Location = {
  id: string;
  regionId: string;
  name: string;
  area: string;
  floor: string;
  kind: XC3LocationKind;
  travel: boolean;
  sourceUrl: string;
};
export type XC3Region = {
  id: string;
  name: string;
  arc: XC3LocationArc;
  chapter: string;
  description: string;
  caution: string;
  sourceUrl: string;
};
export type XC3LocationProgress = { id: string; visited: boolean; bookmarked: boolean };
export type XC3LocationView = {
  arc: XC3LocationArc;
  regionId: string;
  locationId: string;
  query: string;
  kind: "all" | XC3LocationKind;
  progress: "all" | "visited" | "unvisited" | "bookmarked";
};
export const initialXC3LocationView: XC3LocationView = {
  arc: "baseGame", regionId: "XC3-REGION-0", locationId: "", query: "", kind: "all", progress: "all",
};
export const xc3Directory = data as Omit<typeof data, "regions" | "locations"> & { regions: XC3Region[]; locations: XC3Location[] };
export const xc3LocationKinds: Record<XC3LocationKind, string> = { landmark: "地标", location: "地点", secret: "秘境", rest: "休息地点", area: "子地区", colony: "殖民地", reference: "地点参考" };
export const xc3LocationArcs: Record<XC3LocationArc, string> = { baseGame: "本篇", futureRedeemed: "崭新的未来" };
export const xc3RegionsById = new Map(xc3Directory.regions.map((region) => [region.id, region]));

export function matchesXC3Location(location: XC3Location, view: XC3LocationView, progress?: XC3LocationProgress) {
  const region = xc3RegionsById.get(location.regionId);
  if (!region || region.arc !== view.arc) return false;
  if (view.regionId !== "all" && view.regionId !== region.id) return false;
  if (view.kind !== "all" && view.kind !== location.kind) return false;
  if (view.progress === "visited" && !progress?.visited) return false;
  if (view.progress === "unvisited" && progress?.visited) return false;
  if (view.progress === "bookmarked" && !progress?.bookmarked) return false;
  const text = [region.name, xc3LocationArcs[region.arc], region.chapter, location.name, location.area, location.floor].join(" ").normalize("NFKC").toLowerCase();
  return view.query.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.includes(term));
}

export function questsMentioningXC3Location(quests: Quest[], location: XC3Location) {
  const region = xc3RegionsById.get(location.regionId);
  if (!region || location.name.length < 3) return [];
  return quests.filter((quest) => {
    if (quest.game !== "XC3") return false;
    const arc = getQuestArc(quest);
    if (!arc || (arc === "futureRedeemed") !== (region.arc === "futureRedeemed")) return false;
    // A textual mention is a useful cross-reference, not an inferred quest start point.
    const normalize = (text: string) => text.replace(/[\s·・—-]/g, "");
    return [quest.region, quest.giver, quest.prerequisites, quest.notes].some((text) => normalize(text).includes(normalize(location.name)));
  });
}
