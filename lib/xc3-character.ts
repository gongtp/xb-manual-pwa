export type XC3Character = {
  id: string;
  name: string;
  englishName: string;
  arc: "baseGame" | "futureRedeemed";
  kind: "party" | "hero";
  role: "攻击者" | "防卫者" | "治疗者";
  className: string;
  acquisition: string;
  questNames: string[];
  expansion: boolean;
};

export const xc3ArcNames = { baseGame: "本篇", futureRedeemed: "崭新的未来" };
export const xc3KindNames = { party: "队伍角色", hero: "英雄" };
export const xc3CharacterSources = [
  { name: "任天堂 · 战斗系统", url: "https://www.nintendo.com/hk/switch/az3ha/battle/index.html" },
  { name: "Xeno Series Wiki · 职业资料", url: "https://www.xenoserieswiki.org/wiki/Class_(XC3)" },
  { name: "送行者的收集手册 · 英雄任务", url: "https://3.xenoblade.cn/任务/英雄任务" },
  { name: "送行者的收集手册 · 马修", url: "https://xenoblade3.cn/人物/马修" },
  { name: "送行者的收集手册 · A", url: "https://xenoblade3.cn/人物/A" },
  { name: "送行者的收集手册 · 尼可尔", url: "https://xenoblade3.cn/人物/尼可尔" },
  { name: "送行者的收集手册 · 火光", url: "https://xenoblade3.cn/人物/火光" },
  { name: "送行者的收集手册 · 修尔克", url: "https://xenoblade3.cn/人物/修尔克" },
  { name: "送行者的收集手册 · 莱克斯", url: "https://xenoblade3.cn/人物/莱克斯" },
  { name: "送行者的收集手册 · 奈尔", url: "https://xenoblade3.cn/人物/奈尔" },
];

type Entry = [string, string, string, XC3Character["role"], string, string?];
const party: Entry[] = [
  ["noah", "诺亚", "Noah", "攻击者", "剑斗士", "支线剧情：诺亚"],
  ["mio", "弥央", "Mio", "防卫者", "疾风士", "支线剧情：弥央"],
  ["eunie", "优妮", "Eunie", "治疗者", "医护铳兵", "支线剧情：优妮"],
  ["taion", "泰恩", "Taion", "治疗者", "战术士", "支线剧情：泰恩"],
  ["lanz", "兰兹", "Lanz", "防卫者", "重装卫士", "支线剧情：兰兹"],
  ["sena", "圣奈", "Sena", "攻击者", "破碎士", "支线剧情：圣奈"],
];
const heroes: Entry[] = [
  ["ethel", "艾塞尔", "Ethel", "攻击者", "闪光击剑士", "见义不为无勇也"],
  ["valdi", "鲁迪", "Valdi", "治疗者", "战地医护员", "温柔的右手"],
  ["zeon", "泽恩", "Zeon", "防卫者", "守卫指挥官", "情之所钟"],
  ["teach", "师道", "Teach", "治疗者", "炼世士", "力量的方向"],
  ["riku-manana", "里克＆玛娜娜", "Riku & Manana", "攻击者", "雅姆匠人", "诺彭的推荐"],
  ["gray", "格雷", "Gray", "攻击者", "全金属猎豹", "灰色的冲动"],
  ["isurd", "石动", "Isurd", "治疗者", "战略士", "不移之志"],
  ["juniper", "让叶", "Juniper", "攻击者", "幻弓士", "自然"],
  ["ashera", "亚榭菈", "Ashera", "防卫者", "孤独流浪者", "身随修罗之人"],
  ["alexandria", "新名", "Alexandria", "攻击者", "攻骑士", "能够改变的理由"],
  ["monica", "莫妮卡", "Monica", "防卫者", "失落尖兵", "范戴姆的继承者"],
  ["fiona", "真白", "Fiona", "治疗者", "星辉士", "透明的梦"],
  ["triton", "特莱登", "Triton", "攻击者", "灵魂骇客", "咱的武道"],
  ["ghondor", "冈度", "Ghondor", "攻击者", "武术家"],
  ["miyabi", "美雅", "Miyabi", "治疗者", "雅乐士", "支线剧情：弥央"],
  ["cammuravi", "神南火", "Cammuravi", "攻击者", "武翔士", "邂逅未知"],
  ["segiri", "七饭", "Segiri", "攻击者", "机械刺客", "非人少女"],
  ["nia", "尼娅", "Nia", "治疗者", "命巫女"],
  ["melia", "梅莉亚", "Melia", "攻击者", "皇家召唤师"],
  ["ino", "伊诺", "Ino", "防卫者", "诺彭勇者", "诺彭守护者"],
  ["masha", "玛蒂亚", "Masha", "治疗者", "宝石巧匠", "宝石巧匠"],
  ["shulk", "修尔克", "Shulk", "防卫者", "宏伟士兵"],
  ["rex", "莱克斯", "Rex", "攻击者", "主控御刃者"],
];
const future: Entry[] = [
  ["matthew", "马修", "Matthew", "攻击者", "武术家"],
  ["a", "A", "A", "治疗者", "蒙纳多剑士"],
  ["nikol", "尼克尔", "Nikol", "防卫者", "机械士"],
  ["glimmer", "火光", "Glimmer", "治疗者", "奏炎士"],
  ["shulk", "修尔克", "Shulk", "防卫者", "宏伟士兵"],
  ["rex", "莱克斯", "Rex", "攻击者", "主控御刃者"],
  ["nael", "奈尔", "Na’el", "攻击者", "战争魔术师"],
];
const specialAcquisition: Record<string, string> = {
  ghondor: "推进本篇主线剧情后加入。",
  nia: "本篇通关后读取通关存档，前往亚艾提亚地区上层的幽玄之间触发加入事件。",
  melia: "本篇通关后读取通关存档，前往科维斯主堡的主堡正门触发加入事件。",
  shulk: "通关崭新的未来后，在本篇挑战之地完成 The Two Saviors 挑战（任意难度）。专属职业不能由主角继承。",
  rex: "通关崭新的未来后，在本篇挑战之地完成 The Two Saviors 挑战（任意难度）。专属职业不能由主角继承。",
};
function fromEntry(entry: Entry, arc: XC3Character["arc"], kind: XC3Character["kind"]): XC3Character {
  const [key, name, englishName, role, className, quest] = entry;
  const expansion = arc === "futureRedeemed" || ["ino", "masha", "shulk", "rex"].includes(key);
  const acquisition = arc === "futureRedeemed"
    ? key === "nael" ? "通关后作为英雄随队，由 AI 操作。" : "随崭新的未来主线剧情加入，可直接操作。"
    : kind === "party" ? "本篇主线队伍成员；初始职业可在解锁转职后更换。"
    : specialAcquisition[key] ?? `${expansion ? "需要扩展票；" : ""}完成「${quest}」后解锁。后续可用情况随剧情推进变化。`;
  return { id: `${arc}-${key}`, name, englishName, arc, kind, role, className, acquisition, questNames: quest ? [quest] : [], expansion };
}
export const xc3Characters: XC3Character[] = [
  ...party.map((entry) => fromEntry(entry, "baseGame", "party")),
  ...heroes.map((entry) => fromEntry(entry, "baseGame", "hero")),
  ...future.map((entry) => fromEntry(entry, "futureRedeemed", entry[0] === "nael" ? "hero" : "party")),
];
