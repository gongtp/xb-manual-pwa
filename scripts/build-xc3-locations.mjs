// Build from the saved public Chinese location table; no map images are bundled.
import fs from "node:fs";
import crypto from "node:crypto";
// Scripts also occur in the head, so remove them from the full document instead.
const document = fs.readFileSync("work/xc3-locations-source.html", "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const clean = (s) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const regions = [], locations = [];
const kinds = { 地标: "landmark", 地点: "location", 秘境: "secret", 休息地点: "rest", 子地区: "area", 殖民地: "colony" };
const regionNames = ["亚艾提亚地区", "佛尼斯地区", "潘特拉斯地区", "科维斯主堡地区", "嘉登西亚地区", "安格努斯主堡", "大剑", "始源", "都市"];
const source = "https://xenoblade3.cn/地点";
let region;
for (const match of document.matchAll(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>|<tr\b[^>]*>[\s\S]*?<\/tr>/g)) {
  const block = match[0];
  if (block.startsWith("<h")) {
    const name = clean(block);
    if (!regionNames.includes(name)) continue;
    region = { id: `XC3-REGION-${regionNames.indexOf(name)}`, name, arc: "baseGame", chapter: "本篇", description: "按游戏地图分区浏览地标、地点与休息地点。", caution: "部分地点受剧情、任务或场景技能限制。", sourceUrl: source };
    regions.push(region);
    continue;
  }
  if (!region) continue;
  const cells = [...block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (cells.length !== 4) continue;
  const name = clean(cells[0]), kind = kinds[clean(cells[1])];
  if (!kind) throw Error(`Unknown kind: ${clean(cells[1])}`);
  const areas = [...cells[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]).replace(/(.+)\(\1\)/g, "$1"));
  const href = cells[0].match(/href="([^"]+)"/)?.[1];
  const key = `${region.arc}/${name}/${kind}`;
  const existing = locations.find((p) => p.key === key);
  // The source repeats City entries under Great Sword; retain a single City record.
  if (existing) { if (region.name === "都市") existing.regionId = region.id; continue; }
  locations.push({ key, id: "XC3-PLACE-" + crypto.createHash("sha256").update(key).digest("hex").slice(0,12), regionId: region.id, name, area: [...new Set(areas)].join(" / "), floor: "", kind, travel: ["landmark","secret","rest"].includes(kind), sourceUrl: href ? new URL(href, source).href : source });
}
if (regions.length !== 9 || locations.length < 400) throw Error("Incomplete source table");
const futureSource = "https://billyisland.blogspot.com/2023/05/3.html";
const future = {
  "红之森": ["被废弃的储藏库", "无名洞窟", "巴鲁亚滋宫殿"],
  "阿玛内瑟尔高原": ["腐朽的古岚戴尔城堡", "流刑堡垒遗址", "开拓者的眺望", "萨尔摩亚冰释洞窟", "开拓者休息地"],
  "望乡的盆地": ["9号殖民地", "葛托利克斯神托遗迹", "锈毁的3号防空炮塔"],
  "拉古纳利亚遗迹群": ["白国占领地", "淹没的达克夏神殿", "神托之塔", "王之庭园", "湖畔休息地", "鲁米那利亚支柱遗迹", "拉格艾尔湖泊", "拉格艾尔大桥"],
  "黑之山": ["大神殿亚耿遗迹", "贝加萨斯大雪原", "巴涅罗旧街区遗迹群", "贝法鲁阁遗迹", "白磁的王座", "三圣贤至圣所", "监狱岛", "旧街区遗迹休息地", "纳古尔山瞭望台", "第三圣器室"],
};
for (const [name, names] of Object.entries(future)) {
  const id = `XC3-FR-REGION-${regions.filter((r) => r.arc === "futureRedeemed").length}`;
  regions.push({ id, name, arc: "futureRedeemed", chapter: "森托姆尼亚地区", description: "已核对的探索地点与任务参考。", caution: "本篇章当前收录主要地点，尚非全地点清单；未核实类型的条目标为“地点参考”，不据此判断能否传送。", sourceUrl: futureSource });
  for (const place of names) {
    const kind = place === "王之庭园" ? "secret" : place.endsWith("休息地") ? "rest" : "reference";
    locations.push({ id: "XC3-PLACE-" + crypto.createHash("sha256").update(`futureRedeemed/${name}/${place}`).digest("hex").slice(0,12), regionId: id, name: place, area: name, floor: "", kind, travel: kind === "rest" || kind === "secret", sourceUrl: futureSource });
  }
}
fs.writeFileSync("data/xc3-locations.json", JSON.stringify({ regions, locations: locations.map((entry) => { const place = { ...entry }; delete place.key; return place; }) }, null, 2) + "\n");
console.log(JSON.stringify({ regions: regions.length, locations: locations.length, base: locations.filter((l) => l.regionId.startsWith("XC3-REGION")).length }));
