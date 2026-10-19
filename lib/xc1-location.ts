import type { Quest } from "./quest";
import type { XC1Npc } from "./xc1-npc";

export type XC1LocationKind = "landmark" | "location" | "secret";
export type XC1LocationArc = "main" | "futureConnected";
export type XC1Region = {
  id: string;
  name: string;
  englishName: string;
  arc: XC1LocationArc;
  stage: string;
  order: number;
  floors: number;
  sourceUrl: string;
};
export type XC1Location = {
  id: string;
  name: string;
  englishName: string;
  regionId: string;
  kind: XC1LocationKind;
  position: { x: number; y: number; z: number };
  rewards: { exp: number; ap: number; sp: number };
  sourceUrl: string;
};
export type XC1Atlas = {
  edition: string;
  language: string;
  updatedAt: string;
  source: string;
  localizationSourceUrl: string;
  regions: XC1Region[];
  locations: XC1Location[];
};
export type XC1LocationProgress = { id: string; visited: boolean; bookmarked: boolean };
export type XC1LocationFilters = {
  query: string;
  kind: "all" | XC1LocationKind;
  visited: "all" | "visited" | "unvisited";
  bookmarked: boolean;
};

export const locationKindNames: Record<XC1LocationKind, string> = {
  landmark: "地标", location: "地点", secret: "秘境",
};

// Existing NPC records use these alternative names. Resolve them here without
// altering either the NPC directory or the game's Simplified Chinese names.
const locationAliases: Record<string, string[]> = {
  "XC1-PLACE-433": ["纳比尔三岔路"],
  "XC1-PLACE-434": ["盟友海角"],
  "XC1-PLACE-441": ["蝉洞门"],
  "XC1-PLACE-446": ["亚基尼诞生之地"],
  "XC1-PLACE-448": ["格兰德拱门"],
  "XC1-PLACE-449": ["祈愿雕石标"],
  "XC1-PLACE-451": ["调查团驻屯地遗址"],
};

export function normalizeLocationText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

export function matchesLocationFilters(
  location: XC1Location, region: XC1Region, filters: XC1LocationFilters,
  progress?: XC1LocationProgress,
) {
  if (filters.kind !== "all" && location.kind !== filters.kind) return false;
  if (filters.visited === "visited" && !progress?.visited) return false;
  if (filters.visited === "unvisited" && progress?.visited) return false;
  if (filters.bookmarked && !progress?.bookmarked) return false;
  const haystack = normalizeLocationText([
    location.name, location.englishName, location.id, region.name, region.englishName,
    ...(locationAliases[location.id] ?? []),
  ].join(" "));
  return filters.query.trim().split(/\s+/).every((term) => haystack.includes(normalizeLocationText(term)));
}

export function questBelongsToRegion(quest: Quest, region: XC1Region) {
  if (quest.game !== "XC1") return false;
  const arc = quest.chapter.startsWith("相连的未来") ? "futureConnected" : "main";
  return arc === region.arc && normalizeLocationText(quest.region.replace(/（相连的未来）$/, "")) === normalizeLocationText(region.name);
}

export function npcsAtLocation(npcs: XC1Npc[], location: XC1Location, region: XC1Region) {
  const names = [location.name, ...(locationAliases[location.id] ?? [])].map(normalizeLocationText);
  return npcs.filter((npc) => npc.arc === region.arc && npc.appearances.some((appearance) =>
    normalizeLocationText(appearance.region.replace(/（相连的未来）$/, "")) === normalizeLocationText(region.name)
    && names.some((name) => normalizeLocationText(appearance.location).includes(name)),
  ));
}

export function nearbyLandmarks(location: XC1Location, locations: XC1Location[]) {
  return locations.filter((item) => item.id !== location.id && item.regionId === location.regionId && item.kind !== "location")
    .map((item) => ({
      location: item,
      distance: Math.hypot(item.position.x - location.position.x, item.position.z - location.position.z),
      heightDifference: item.position.y - location.position.y,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}

// Equal scale on X and Z; positions are projected, never a fabricated terrain map.
export function projectLocations(locations: XC1Location[]) {
  if (!locations.length) return [];
  const xs = locations.map((item) => item.position.x);
  const zs = locations.map((item) => item.position.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min(600 / Math.max(1, maxX - minX), 220 / Math.max(1, maxZ - minZ));
  return locations.map((location) => ({
    location,
    left: (350 + (location.position.x - (minX + maxX) / 2) * scale) / 7,
    top: (150 + (location.position.z - (minZ + maxZ) / 2) * scale) / 3,
  }));
}
