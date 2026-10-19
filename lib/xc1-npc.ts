export type XC1NpcArc = "main" | "futureConnected";

export type XC1NpcAppearance = {
  region: string;
  location: string;
  activeTime: string;
  condition: string;
};

export type XC1Npc = {
  id: string;
  name: string;
  arc: XC1NpcArc;
  appearances: XC1NpcAppearance[];
  questIds: string[];
  source: string;
  sourceUrl: string;
  notes: string;
  updatedAt: string;
};

export function isXC1NpcArc(value: unknown): value is XC1NpcArc {
  return value === "main" || value === "futureConnected";
}
