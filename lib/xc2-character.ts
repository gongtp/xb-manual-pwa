import characterData from "../data/xc2-characters.json";

export type XC2CharacterArc = "baseGame" | "expansionPass" | "torna";
export type XC2AcquisitionType = "story" | "resonance" | "quest" | "special" | "newGamePlus" | "challenge" | "torna";
export type XC2Character = {
  id: string; kind: "driver" | "blade"; name: string; englishName: string; arc: XC2CharacterArc; group: string;
  element: string; role: string; weapon: string; acquisition: string; acquisitionType: XC2AcquisitionType;
  description: string; fieldSkills: string[]; battleSkills: Array<{ name: string; effect: string }>;
  favoriteCategories: string[]; favoriteItems: string[]; auxCores: number | null; statModifier: string;
  partners: string[]; image: string; imageSource: string; sourceUrl: string; updatedAt: string;
  spoiler: boolean; playable: boolean; collectible: boolean; isForm: boolean; questIds: string[];
};
export type XC2CharacterProgress = { id: string; collected: boolean; bookmarked: boolean };
export const xc2Characters: XC2Character[] = characterData as XC2Character[];

export const xc2CharacterCatalogSources = {
  updatedAt: "2026-10-03",
  scope: "Nintendo Switch 原版本篇、免费更新、扩展票与黄金之国伊拉的可操作队伍；未纳入 Switch 2 Edition 新增内容与随机普通异刃个体。",
  catalog: "https://xenoblade2.cn/异刃",
  drivers: "https://xenoblade2.cn/御刃者",
  bladeQuestRelations: "https://xenoblade2.cn/异刃任务",
  tornaSkills: ["真", "霞", "光", "米诺奇", "迦具土", "绵津见"].map((name) => `https://xenoblade2.cn/黄金之国伊拉:${name}/牵绊圆环`),
  corrections: [
    { characterId: "XC2-BLADE-CRESSIDUS", field: "statModifier", value: "最大HP20%", reason: "详情页修正值错字；分类表与原版游戏 CHR_Bl ID 1048 一致，HpMaxRev=20、StrengthRev=0。", sourceUrl: "https://xenoblade.github.io/xb2/bdat/common/CHR_Bl.html#1048" },
  ],
} as const;
