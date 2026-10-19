import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = "https://xenobladex.cn";
const cache = path.resolve("work/xcx-sources");
const types = { 剧情任务: 15, 牵绊任务: 58, 普通任务: 194, 简易任务: 361 };
const refresh = process.argv.includes("--refresh");
await mkdir(cache, { recursive: true });

function text(html = "") {
  return html.replace(/<[^>]*>/g, "").replace(/&#(x[\da-f]+|\d+);/gi, (_, code) =>
    String.fromCodePoint(code[0] === "x" ? parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

async function fetchPage(title) {
  const file = path.join(cache, `${title.replaceAll("/", "-")}.html`);
  if (!refresh) {
    try { return await readFile(file, "utf8"); } catch { /* Fetch missing cache entries. */ }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${base}/${encodeURI(title)}`, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
      const html = await response.text();
      assert.ok(html.includes("<main"), `${title}: missing page content`);
      await writeFile(file, html);
      return html;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

function main(html) { return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? ""; }
function cells(row) { return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]); }
function items(html) {
  const result = [];
  let depth = 0;
  let start = 0;
  for (const match of html.matchAll(/<\/?li\b[^>]*>/g)) {
    if (!match[0].startsWith("</")) {
      if (depth++ === 0) start = match.index + match[0].length;
    } else if (--depth === 0) {
      result.push(text(html.slice(start, match.index).replace(/<\/?(?:li|ul|ol)\b[^>]*>/g, " ")));
    }
  }
  return result.filter(Boolean);
}
function rsc(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => JSON.parse(m[1])).join("");
}
function sections(html) {
  return html.split(/<h[23]\b[^>]*>/).slice(1).map((part) => {
    const [label, ...body] = part.split(/<\/h[23]>/);
    return { label: text(label), body: body.join("") };
  });
}
function section(html, label) { return sections(html).find((part) => part.label === label)?.body ?? ""; }

function flowMarkdown(html) {
  const lists = [];
  let output = "";
  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (/^<(ol|ul)\b/.test(token)) lists.push({ ordered: token.startsWith("<ol"), index: 0 });
    else if (/^<\/(ol|ul)>/.test(token)) { lists.pop(); output += "\n"; }
    else if (/^<li\b/.test(token)) {
      const list = lists.at(-1);
      output += `\n${"  ".repeat(Math.max(0, lists.length - 1))}${list?.ordered ? `${++list.index}.` : "-"} `;
    } else if (/^<\/?p\b/.test(token)) output += "\n\n";
    else if (/^<br\b/.test(token)) output += " ";
    else if (!token.startsWith("<")) output += text(token) ? token.replace(/\s+/g, " ") : "";
  }
  return output.split("\n").map((line) => line.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function divAt(html, offset) {
  let depth = 0;
  for (const match of html.slice(offset).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(offset, offset + match.index + match[0].length);
  }
  throw new Error("Unclosed reward block");
}

function rewardGroups(html) {
  const groups = [];
  for (const match of html.matchAll(/<div class="px-4 (?:py|pb)-3 text-sm"><div class="text-primary-400">(?:报酬|额外获得)/g)) {
    const block = divAt(html, match.index);
    const label = text(block.match(/<div class="text-primary-400">([\s\S]*?)<\/div>/)?.[1]);
    const values = [...block.matchAll(/<div class="flex justify-between pl-2">([\s\S]*?)<\/div><div>([\s\S]*?)<\/div><\/div>/g)]
      .map((m) => `${text(m[1])} ${text(m[2])}`);
    values.push(...[...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1])));
    groups.push({ label, values });
  }
  return groups;
}

const entries = [];
for (const [type, expected] of Object.entries(types)) {
  const content = main(await fetchPage(type));
  const rows = [...content.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1])).filter((row) => row.length === 3);
  assert.equal(rows.length, expected, `${type}: directory count changed; review the source before updating`);
  for (const row of rows) {
    const href = row[0].match(/href="([^"#]*\/任务\/[^"#]+)"/)?.[1];
    assert.ok(href, `${type}: missing quest link`);
    entries.push({ type, title: decodeURIComponent(href).replace(/^\//, ""), level: Number(text(row[1])), conditions: items(row[2]) });
  }
}
assert.equal(new Set(entries.map((entry) => entry.title)).size, entries.length);

const records = [];
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    const html = await fetchPage(entry.title);
    const content = main(html);
    const data = rsc(html);
    const id = data.match(/"FLD_questlist":\{"(\d+)":true\}/)?.[1];
    assert.ok(id, `${entry.title}: missing game quest ID`);
    const name = text(content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]).replace(/\((?:\d+|简易任务)\)$/, "");
    let branch = "";
    const objectiveGroups = [];
    for (const part of sections(content)) {
      if (part.label.startsWith("选择")) branch = part.label;
      if (part.label === "目的" || /^分支[\dA-Z]/.test(part.label)) {
        const guidance = [...part.body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
        objectiveGroups.push({ branch: part.label === "目的" ? branch : part.label, steps: items(part.body), guidance, markdown: flowMarkdown(part.body) });
      }
    }
    const objectives = objectiveGroups.flatMap((group) => group.steps);
    const conditions = items(section(content, "条件"));
    assert.ok(name, `${entry.title}: missing name`);
    assert.deepEqual(conditions, entry.conditions, `${entry.title}: conditions disagree with directory`);
    const giver = text(content.match(/>委托人<\/div><div[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const rewards = rewardGroups(content);
    const languages = [...section(content, "其他语言译名").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]).map(text));
    const englishName = languages.find((row) => row[0] === "英语")?.[1] ?? "";
    const npcPosition = data.match(/"npcpopdata":(\{[^}]+\}|null)/)?.[1];
    const branchResults = text(section(content, "结果分支"));
    records.push({ ...entry, id: Number(id), name, englishName, giver, rewards, objectives, objectiveGroups, conditions, branchResults,
      npcPosition: npcPosition ? JSON.parse(npcPosition) : null });
    if (records.length % 50 === 0) console.log(`Fetched ${records.length}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
records.sort((a, b) => a.id - b.id);
assert.equal(new Set(records.map((entry) => entry.id)).size, records.length);
await writeFile(path.join(cache, "parsed.json"), `${JSON.stringify(records, null, 2)}\n`);
console.log(`Parsed ${records.length} quests.`);

// Join the public location table to its map data rather than guessing a quest's
// acceptance region from its first objective (which often lies elsewhere).
const locations = await fetchPage("地点");
const locationRegions = new Map([...main(locations).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map((match) => cells(match[1])).filter((row) => row.length >= 3).map((row) => [text(row[0]), text(row[2])]));
const zones = new Map();
for (const match of rsc(locations).matchAll(/"zoneIds":(\[[\d",]+\]),"FLD_Location":\d+,"title":"地点\/([^"\n]+)"/g)) {
  const region = locationRegions.get(match[2]);
  if (region) for (const zone of JSON.parse(match[1])) zones.set(zone, region);
}
const byTitle = new Map(records.map((entry) => [entry.title.slice(3), entry]));
function chapterMilestone(entry, seen = new Set()) {
  if (seen.has(entry.id)) return 0;
  const nextSeen = new Set([...seen, entry.id]);
  let milestone = 0;
  for (const condition of entry.conditions) {
    if (/^(未|禁止)/.test(condition)) continue;
    for (const match of condition.matchAll(/“([^”]+)”/g)) {
      const story = match[1].match(/^第(\d+)章/);
      if (story) milestone = Math.max(milestone, Number(story[1]));
      else {
        const parent = byTitle.get(match[1]);
        if (parent) milestone = Math.max(milestone, chapterMilestone(parent, nextSeen));
      }
    }
  }
  return milestone;
}

const quests = records.map((entry) => {
  const supplements = {
    1110: { region: "居住区", location: "教堂", url: "https://game8.co/games/Xenoblade-Chronicles-X/archives/506299" },
    1201: { region: "异刃区", location: "异刃区的牵绊任务符号", url: "https://nightlygamingbinge.com/xenoblade-chronicles-x-affinity-missions-guide/" },
  };
  const supplement = supplements[entry.id];
  const parentTitle = entry.conditions.map((condition) => condition.match(/^“([^”]+)”的子任务$/)?.[1]).find(Boolean);
  const parent = parentTitle ? byTitle.get(parentTitle) : undefined;
  const region = entry.type === "简易任务" ? "异刃区（任务板）"
    : entry.type === "剧情任务" ? "异刃基地"
      : zones.get(entry.npcPosition?.zoneId) ?? supplement?.region ?? (parent ? zones.get(parent.npcPosition?.zoneId) : "") ?? "";
  assert.ok(region, `${entry.title}: unrecognized acceptance region ${entry.npcPosition?.zoneId}`);
  assert.ok(entry.objectives.length && entry.giver, `${entry.title}: missing quest facts`);
  const milestone = chapterMilestone(entry);
  const startsDuringChapter = entry.conditions.some((condition) => /^开始任务“第\d+章/.test(condition));
  const progress = entry.type === "剧情任务" ? entry.name
    : milestone ? `第${milestone}章${startsDuringChapter ? "进行中" : "完成后"}` : "随前置任务开放";
  const deadlines = entry.conditions.filter((condition) => /^未(?:开始|完成)任务/.test(condition));
  const reward = entry.rewards.length ? entry.rewards.map((group) => `${group.label}：${group.values.join("、")}`).join("；") : "无直接报酬";
  const sourceUrl = `${base}/${encodeURI(entry.title)}`;
  const notes = [
    "## 任务资料",
    `版本：Nintendo Switch《异度神剑X 终极版》简体中文。${entry.englishName ? `\n\n英文名：${entry.englishName}` : ""}\n\n建议等级：${entry.level > 1 ? `Lv.${entry.level}` : "来源未指定"}`,
    parent ? `随“${parent.name}”触发，不能独立接取。`
      : entry.type === "简易任务" ? "接取：NLA 异刃区的任务板。任务板委托人不一定在接取地点。" : `接取地区：${region}${supplement ? ` · ${supplement.location}` : ""}。`,
    "## 接取条件",
    entry.conditions.length ? entry.conditions.map((condition) => `- ${condition}`).join("\n") : "随剧情自动开放，无额外前置任务。",
    ...(deadlines.length ? ["## 接取期限", `以下条件失效后可能无法再接取，建议先处理本任务：\n\n${deadlines.map((condition) => `- ${condition}`).join("\n")}`] : []),
    "## 任务流程",
    ...entry.objectiveGroups.map((group) => `${group.branch ? `### ${group.branch}\n\n` : ""}${group.markdown}`),
    ...(entry.branchResults ? ["## 分支结果", entry.branchResults] : []),
    "## 奖励", entry.rewards.length ? entry.rewards.map((group) => `- ${group.label}：${group.values.join("、")}`).join("\n") : "无直接报酬；完成目标后推进对应任务。",
    "## 资料来源", `[米拉地理网 · ${entry.title.slice(3)}](${sourceUrl})`,
    ...(supplement ? [`[接取地点补充核对](${supplement.url})`] : []),
  ].join("\n\n");
  return {
    id: `XCX-Q-${String(entry.id).padStart(4, "0")}`, game: "XCX", name: entry.name, type: entry.type,
    chapter: `终极版 · ${progress}`, region, giver: entry.giver, reward,
    prerequisites: entry.conditions.join("；") || "随剧情自动开放",
    source: "米拉地理网（Switch 终极版简体中文）", sourceUrl, status: "complete",
    markerId: "", isTimed: deadlines.length > 0, isExclusive: false, exclusiveGroup: "", exclusiveRoute: "",
    manualNotes: "", notes, updatedAt: "2026-10-18",
  };
});
const exclusiveBranches = quests.filter((quest) => ["XCX-Q-1023", "XCX-Q-1110"].includes(quest.id));
assert.equal(exclusiveBranches.length, 2);
for (const quest of exclusiveBranches) {
  quest.isExclusive = true;
  quest.exclusiveGroup = "XCX-DEFINIAN-DOWNFALL";
  quest.exclusiveRoute = quest.id === "XCX-Q-1023" ? "A" : "B";
  quest.notes += `\n\n## 互斥任务\n\n“歼灭戴菲尼亚”的结果决定后续路线。本任务与“${exclusiveBranches.find((peer) => peer.id !== quest.id).name}”不能在同一周目同时接取。`;
}
assert.equal(quests.length, 628);
assert.equal(quests.filter((quest) => quest.name.startsWith("第13章")).length, 3);
await writeFile("data/xcx-quests.json", `${JSON.stringify(quests, null, 2)}\n`);
console.log(`Wrote ${quests.length} quests to data/xcx-quests.json`);
