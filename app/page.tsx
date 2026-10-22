"use client";
import { dataFetch } from "../lib/data-client";
import DataTools from "./data-tools";
import "./mobile.css";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import GameNotes, { MarkdownPreview } from "./game-notes";
import { ArchiveLogo, UiIcon, type IconName } from "./ui-icons";
import XC1NpcDirectory from "./xc1-npcs";
import XC1LocationDirectory, { initialLocationView, type XC1LocationView } from "./xc1-locations";
import XC2CharacterDirectory from "./xc2-characters";
import XC2LocationDirectory from "./xc2-locations";
import { initialXC2LocationView, type XC2LocationView } from "../lib/xc2-location";
import {
  gameCodes,
  gameNames,
  questTypesByGame,
  qualityStatuses,
  statusMeta,
  supportsQuestRiskFlags,
  type GameCode,
  type QualityStatus,
  type Quest,
  type QuestLabel,
} from "../lib/quest";
import {
  getXC1Arc,
  getQuestArc,
  questMatchesFilters,
  type BinaryQuestFilter,
  type MarkerFilter,
  type QuestArc,
  type QuestArcFilter,
  type QuestFilterDimension,
  type QuestFilterState,
  type XC1Arc,
} from "../lib/quest-filters";
import type { XC1Npc } from "../lib/xc1-npc";
import { formatXC1StoryProgress } from "../lib/xc1-story-progress";

type ImportReport = {
  fileName: string;
  added: number;
  updated: number;
  skipped: number;
  records: Quest[];
};

type ActiveModule = "quests" | "notes" | "npcs" | "locations" | "xc2Characters" | "xc2Locations";

type ExclusiveQuestInfo = {
  group: string;
  route: string;
  peers: Quest[];
};

type SidebarModule = {
  id: string;
  icon: IconName;
  label: string;
  target?: ActiveModule;
};

const taskQualityStatuses = qualityStatuses.filter((status) => status !== "conflict");

const sidebarModulesByGame: Record<GameCode, SidebarModule[]> = {
  XCX: [
    { id: "quests", icon: "list", label: "任务资料", target: "quests" },
    { id: "notes", icon: "notebook", label: "玩法笔记", target: "notes" },
  ],
  XC1: [
    { id: "quests", icon: "list", label: "任务资料", target: "quests" },
    { id: "notes", icon: "notebook", label: "玩法笔记", target: "notes" },
    { id: "characters", icon: "users", label: "角色与 NPC", target: "npcs" },
    { id: "items", icon: "gift", label: "奖励与道具" },
    { id: "locations", icon: "map", label: "地区与地点", target: "locations" },
  ],
  XC2: [
    { id: "quests", icon: "list", label: "任务资料", target: "quests" },
    { id: "notes", icon: "notebook", label: "玩法笔记", target: "notes" },
    { id: "characters", icon: "users", label: "角色与异刃", target: "xc2Characters" },
    { id: "mercenaries", icon: "file", label: "佣兵团" },
    { id: "locations", icon: "list", label: "地区与地点", target: "xc2Locations" },
  ],
  XC3: [
    { id: "quests", icon: "list", label: "任务资料", target: "quests" },
    { id: "notes", icon: "notebook", label: "玩法笔记", target: "notes" },
    { id: "characters", icon: "users", label: "角色与英雄" },
    { id: "classes", icon: "file", label: "职业与技能" },
    { id: "locations", icon: "map", label: "地区与地点" },
  ],
};

const xc1ArcNames: Record<XC1Arc, string> = {
  main: "本篇",
  futureConnected: "相连的未来",
};

const questArcNames: Record<QuestArc, string> = {
  ...xc1ArcNames,
  baseGame: "本篇",
  expansionPass: "扩展票",
  torna: "黄金之国伊拉",
  futureRedeemed: "崭新的未来",
  definitiveEdition: "终极版",
};

function getChapterProgress(chapter: string) {
  return chapter.replace(/^(本篇|相连的未来|扩展票|黄金之国伊拉|崭新的未来|终极版)\s*·\s*/, "").trim();
}

function getChapterProgressLabel(chapter: string, game: GameCode) {
  const progress = getChapterProgress(chapter);
  return game === "XC1" ? formatXC1StoryProgress(progress) : progress;
}

function withXC1Arc(chapter: string, arc: XC1Arc) {
  const progress = getChapterProgress(chapter) || (arc === "main" ? "随剧情/地区评价" : "随剧情开放");
  return `${xc1ArcNames[arc]} · ${progress}`;
}

function withQuestArc(chapter: string, arc: QuestArc) {
  if (arc === "main" || arc === "futureConnected") return withXC1Arc(chapter, arc);
  const progress = getChapterProgress(chapter) || (arc === "torna" ? "随剧情或人和之力开放" : "随剧情开放");
  return `${questArcNames[arc]} · ${progress}`;
}

function getQuestArcLabel(quest: Quest) {
  const arc = getQuestArc(quest);
  return arc ? questArcNames[arc] : "未分类";
}

function getQuestTypeTone(type: string) {
  if (["剧情任务", "主线任务", "主线剧情"].includes(type)) return "type-story";
  if (["支线任务", "普通任务"].includes(type)) return "type-standard";
  if (type === "突发任务") return "type-event";
  if (type === "特殊事件") return "type-special";
  if (["异刃任务", "英雄任务", "牵绊任务"].includes(type)) return "type-character";
  if (type === "简易任务") return "type-event";
  if (type === "佣兵团任务") return "type-mercenary";
  return "type-neutral";
}

function getLegacyNoteValue(notes: string, label: string) {
  const prefix = `${label}：`;
  return notes
    .split("；")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? "";
}

function isTimedQuest(quest: Quest) {
  return quest.isTimed;
}

function getExclusiveGroup(quest: Quest) {
  return quest.isExclusive ? quest.exclusiveGroup : "";
}

function getPaginationItems(current: number, total: number) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const valid = [...pages].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right);
  const items: Array<number | string> = [];
  valid.forEach((page, index) => {
    const previous = valid[index - 1];
    if (previous && page - previous > 1) items.push(`ellipsis-${previous}`);
    items.push(page);
  });
  return items;
}

const emptyQuest: Quest = {
  id: "",
  game: "XC1",
  name: "",
  type: "支线任务",
  chapter: "本篇 · 随剧情/地区评价",
  region: "",
  giver: "",
  reward: "",
  prerequisites: "",
  source: "",
  sourceUrl: "",
  status: "incomplete",
  markerId: "",
  isTimed: false,
  isExclusive: false,
  exclusiveGroup: "",
  exclusiveRoute: "",
  manualNotes: "",
  notes: "",
  updatedAt: "",
};

function getIssues(quest: Quest) {
  const fields: Array<["region" | "giver" | "source", string]> = [
    ["region", "缺少地区"],
    ["giver", "缺少委托人"],
    ["source", "缺少资料来源"],
  ];
  const issues = fields.filter(([key]) => !quest[key].trim()).map(([, label]) => label);
  if (quest.status === "pending") issues.unshift("需要人工核验");
  if (quest.status === "conflict") issues.unshift("多个来源存在冲突");
  if (!quest.sourceUrl && quest.source && !quest.source.includes("游戏内文本") && !quest.source.includes("攻略本")) {
    issues.push("来源没有可追溯链接");
  }
  return issues;
}

function normalizeStatus(value: unknown): QualityStatus {
  const text = String(value ?? "").toLowerCase();
  if (["complete", "完整", "资料完整"].includes(text)) return "complete";
  if (["pending", "待核验", "待人工核验"].includes(text)) return "pending";
  if (["conflict", "冲突", "来源冲突"].includes(text)) return "conflict";
  return "incomplete";
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "是"].includes(text)) return true;
  if (["false", "0", "no", "否"].includes(text)) return false;
  return fallback;
}

function normalizeGame(value: unknown): GameCode | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (["XC1", "异度神剑1", "异度神剑 1"].includes(text)) return "XC1";
  if (["XC2", "异度神剑2", "异度神剑 2"].includes(text)) return "XC2";
  if (["XC3", "异度神剑3", "异度神剑 3"].includes(text)) return "XC3";
  if (["XCX", "XBX", "异度神剑X", "异度神剑 X", "异度神剑X 终极版", "异度神剑 X 终极版"].includes(text)) return "XCX";
  return null;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function recordsFromCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function toQuest(record: Record<string, unknown>): Quest | null {
  const game = normalizeGame(record.game ?? record.gameCode ?? record["游戏"]);
  const id = String(record.id ?? record.external_id ?? record["任务编号"] ?? "").trim();
  const name = String(record.name ?? record.title ?? record["任务名称"] ?? "").trim();
  if (!game || !id || !name) return null;
  const notes = String(record.notes ?? record["任务流程（Markdown）"] ?? record["任务流程"] ?? record["备注"] ?? "");
  const supportsRiskFlags = supportsQuestRiskFlags(game);
  const legacyExclusiveGroup = getLegacyNoteValue(notes, "互斥组");
  const exclusiveGroup = supportsRiskFlags
    ? String(record.exclusiveGroup ?? record.exclusive_group ?? record["互斥组"] ?? legacyExclusiveGroup)
    : "";
  const exclusiveRoute = supportsRiskFlags
    ? String(record.exclusiveRoute ?? record.exclusive_route ?? record["互斥路线"] ?? getLegacyNoteValue(notes, "路线"))
    : "";
  return {
    id,
    game,
    name,
    type: String(record.type ?? record["任务类型"] ?? questTypesByGame[game][0]),
    chapter: String(record.chapter ?? record["章节"] ?? ""),
    region: String(record.region ?? record["地区"] ?? ""),
    giver: String(record.giver ?? record["委托人"] ?? ""),
    reward: String(record.reward ?? record["奖励"] ?? ""),
    prerequisites: String(record.prerequisites ?? record["前置条件"] ?? ""),
    source: String(record.source ?? record["来源"] ?? ""),
    sourceUrl: String(record.sourceUrl ?? record.source_url ?? record["来源链接"] ?? ""),
    status: normalizeStatus(record.status ?? record["资料状态"]),
    markerId: String(record.markerId ?? record.marker_id ?? record["标记编号"] ?? ""),
    isTimed: supportsRiskFlags && normalizeBoolean(record.isTimed ?? record.is_timed ?? record["是否限时"], getLegacyNoteValue(notes, "限时") === "是"),
    isExclusive: supportsRiskFlags && normalizeBoolean(record.isExclusive ?? record.is_exclusive ?? record["是否互斥"], Boolean(exclusiveGroup)),
    exclusiveGroup,
    exclusiveRoute,
    manualNotes: String(record.manualNotes ?? record.manual_notes ?? record["手动备注"] ?? ""),
    notes,
    updatedAt: String(record.updatedAt ?? record.updated_at ?? record["更新时间"] ?? new Date().toISOString().slice(0, 10)),
  };
}

async function requestQuestDatabase(method = "GET", body?: unknown) {
  const response = await dataFetch("/api/quests", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { error?: string; quest?: Quest; quests?: Quest[]; labels?: QuestLabel[] };
  if (!response.ok) throw new Error(payload.error || "数据库操作失败");
  return payload;
}

async function requestQuestLabels(method = "GET", body?: unknown) {
  const response = await dataFetch("/api/quest-labels", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { error?: string; label?: QuestLabel; labels?: QuestLabel[] };
  if (!response.ok) throw new Error(payload.error || "标签操作失败");
  return payload;
}

async function requestXC1NpcDatabase() {
  const response = await dataFetch("/api/xc1-npcs");
  const payload = await response.json() as { error?: string; npcs?: XC1Npc[] };
  if (!response.ok) throw new Error(payload.error || "NPC 数据库读取失败");
  return payload;
}

function subscribePhoneLayout(onChange: () => void) {
  const query = window.matchMedia("(max-width: 780px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function Home() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [questLabels, setQuestLabels] = useState<QuestLabel[]>([]);
  const [xc1Npcs, setXc1Npcs] = useState<XC1Npc[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [gameFilter, setGameFilter] = useState<GameCode>("XC1");
  const [activeModule, setActiveModule] = useState<ActiveModule>("quests");
  const [locationView, setLocationView] = useState<XC1LocationView>(initialLocationView);
  const [xc2LocationView, setXc2LocationView] = useState<XC2LocationView>(initialXC2LocationView);
  const [markerFilter, setMarkerFilter] = useState<MarkerFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [arcFilter, setArcFilter] = useState<QuestArcFilter>("main");
  const [timedFilter, setTimedFilter] = useState<BinaryQuestFilter>("all");
  const [exclusiveFilter, setExclusiveFilter] = useState<BinaryQuestFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const isPhoneLayout = useSyncExternalStore(subscribePhoneLayout, () => window.matchMedia("(max-width: 780px)").matches, () => false);
  const [preferredPageSize, setPageSize] = useState<number | null>(null);
  const pageSize = preferredPageSize ?? (isPhoneLayout ? 10 : 20);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [questNotesView, setQuestNotesView] = useState<"write" | "preview">("write");
  const [importOpen, setImportOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest>(emptyQuest);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [exclusivePeerId, setExclusivePeerId] = useState("");
  const [exclusivePeerQuery, setExclusivePeerQuery] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [databaseError, setDatabaseError] = useState("");
  const [npcDatabaseError, setNpcDatabaseError] = useState("");
  const [npcLoading, setNpcLoading] = useState(true);
  const [markingQuestId, setMarkingQuestId] = useState("");
  const [customLabelName, setCustomLabelName] = useState("");
  const [markerSavingId, setMarkerSavingId] = useState("");
  const [labelDeletingId, setLabelDeletingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestQuestDatabase()
      .then((payload) => {
        if (cancelled) return;
        const records = payload.quests ?? [];
        setQuests(records);
        setQuestLabels(payload.labels ?? []);
        setSelectedId(records[0]?.id ?? "");
      })
      .catch((error: Error) => {
        if (!cancelled) setDatabaseError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestXC1NpcDatabase()
      .then((payload) => {
        if (cancelled) return;
        const records = payload.npcs ?? [];
        setXc1Npcs(records);
        setSelectedNpcId(records[0]?.id ?? "");
      })
      .catch((error: Error) => {
        if (!cancelled) setNpcDatabaseError(error.message);
      })
      .finally(() => {
        if (!cancelled) setNpcLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const search = document.querySelector<HTMLInputElement>("[data-archive-search], .topbar .search-box input, .atlas-search input");
        if (search && !document.querySelector('[aria-modal="true"]')) {
          event.preventDefault();
          search.focus();
          search.select();
        }
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!detailOpen && !editorOpen && !importOpen && !markingQuestId) return;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    document.body.style.overflow = "hidden";
    (focusable()[0] ?? dialog).focus();
    const onDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (markingQuestId) setMarkingQuestId("");
        else if (importOpen) setImportOpen(false);
        else if (editorOpen) setEditorOpen(false);
        else setDetailOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onDialogKey);
    return () => {
      document.removeEventListener("keydown", onDialogKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [detailOpen, editorOpen, importOpen, markingQuestId]);

  const xc1ArcCounts = useMemo(() => ({
    main: quests.filter((quest) => quest.game === "XC1" && getXC1Arc(quest.chapter) === "main").length,
    futureConnected: quests.filter((quest) => quest.game === "XC1" && getXC1Arc(quest.chapter) === "futureConnected").length,
  }), [quests]);
  const xc2ArcCounts = useMemo(() => ({
    baseGame: quests.filter((quest) => quest.game === "XC2" && getQuestArc(quest) === "baseGame").length,
    expansionPass: quests.filter((quest) => quest.game === "XC2" && getQuestArc(quest) === "expansionPass").length,
    torna: quests.filter((quest) => quest.game === "XC2" && getQuestArc(quest) === "torna").length,
  }), [quests]);
  const xc3ArcCounts = useMemo(() => ({
    baseGame: quests.filter((quest) => quest.game === "XC3" && getQuestArc(quest) === "baseGame").length,
    expansionPass: quests.filter((quest) => quest.game === "XC3" && getQuestArc(quest) === "expansionPass").length,
    futureRedeemed: quests.filter((quest) => quest.game === "XC3" && getQuestArc(quest) === "futureRedeemed").length,
  }), [quests]);
  const gameQuests = useMemo(
    () => quests.filter((quest) => quest.game === gameFilter),
    [gameFilter, quests],
  );
  const gameQuestLabels = useMemo(
    () => questLabels.filter((label) => label.game === gameFilter),
    [gameFilter, questLabels],
  );
  const questLabelById = useMemo(
    () => new Map(questLabels.map((label) => [label.id, label])),
    [questLabels],
  );
  const npcByQuestId = useMemo(() => {
    const result = new Map<string, XC1Npc>();
    xc1Npcs.forEach((npc) => npc.questIds.forEach((questId) => result.set(questId, npc)));
    return result;
  }, [xc1Npcs]);
  const exclusiveInfoById = useMemo(() => {
    const groups = new Map<string, Quest[]>();
    quests.forEach((quest) => {
      const group = getExclusiveGroup(quest);
      if (!group) return;
      groups.set(group, [...(groups.get(group) ?? []), quest]);
    });

    const infoById = new Map<string, ExclusiveQuestInfo>();
    groups.forEach((members, group) => {
      members.forEach((quest) => infoById.set(quest.id, {
        group,
        route: quest.exclusiveRoute,
        peers: members.filter((candidate) => candidate.id !== quest.id),
      }));
    });
    return infoById;
  }, [quests]);
  const types = useMemo(() => {
    const configured = questTypesByGame[gameFilter];
    const imported = quests
      .filter((quest) => quest.game === gameFilter)
      .map((quest) => quest.type);
    return [...new Set([...configured, ...imported])];
  }, [gameFilter, quests]);
  const allRegions = useMemo(() => {
    const available = quests
      .filter((quest) => quest.game === gameFilter)
      .map((quest) => quest.region)
      .filter(Boolean);
    return [...new Set(available)].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [gameFilter, quests]);

  const filterState = useMemo<QuestFilterState>(() => ({
    game: gameFilter,
    status: "all",
    marker: markerFilter,
    type: typeFilter,
    arc: arcFilter,
    timed: timedFilter,
    exclusive: exclusiveFilter,
    region: regionFilter,
    query,
  }), [arcFilter, exclusiveFilter, gameFilter, markerFilter, query, regionFilter, timedFilter, typeFilter]);

  const matchesQuestFilters = useCallback(
    (quest: Quest, omitted?: QuestFilterDimension) => questMatchesFilters(quest, filterState, omitted),
    [filterState],
  );

  const filterFacets = useMemo(() => {
    const pool = (dimension: QuestFilterDimension) => quests.filter((quest) => matchesQuestFilters(quest, dimension));
    const typePool = pool("type");
    const arcPool = pool("arc");
    const timedPool = pool("timed");
    const exclusivePool = pool("exclusive");
    const regionPool = pool("region");
    const markerPool = pool("marker");
    const typeCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();
    const markerCounts = new Map<string, number>();
    typePool.forEach((quest) => typeCounts.set(quest.type, (typeCounts.get(quest.type) ?? 0) + 1));
    regionPool.forEach((quest) => regionCounts.set(quest.region, (regionCounts.get(quest.region) ?? 0) + 1));
    markerPool.forEach((quest) => {
      if (quest.markerId) markerCounts.set(quest.markerId, (markerCounts.get(quest.markerId) ?? 0) + 1);
    });
    const exclusiveQuests = exclusivePool.filter((quest) => quest.isExclusive);
    return {
      type: { all: typePool.length, counts: typeCounts },
      arc: {
        all: arcPool.length,
        main: arcPool.filter((quest) => getQuestArc(quest) === "main").length,
        futureConnected: arcPool.filter((quest) => getQuestArc(quest) === "futureConnected").length,
        baseGame: arcPool.filter((quest) => getQuestArc(quest) === "baseGame").length,
        expansionPass: arcPool.filter((quest) => getQuestArc(quest) === "expansionPass").length,
        torna: arcPool.filter((quest) => getQuestArc(quest) === "torna").length,
        futureRedeemed: arcPool.filter((quest) => getQuestArc(quest) === "futureRedeemed").length,
      },
      timed: {
        all: timedPool.length,
        yes: timedPool.filter(isTimedQuest).length,
        no: timedPool.filter((quest) => !isTimedQuest(quest)).length,
      },
      exclusive: {
        all: exclusivePool.length,
        yes: exclusiveQuests.length,
        no: exclusivePool.length - exclusiveQuests.length,
        groups: new Set(exclusiveQuests.map(getExclusiveGroup).filter(Boolean)).size,
      },
      region: { all: regionPool.length, counts: regionCounts },
      marker: {
        all: markerPool.length,
        unmarked: markerPool.filter((quest) => !quest.markerId).length,
        counts: markerCounts,
      },
    };
  }, [matchesQuestFilters, quests]);

  const regionOptions = useMemo(
    () => allRegions.filter((region) => (filterFacets.region.counts.get(region) ?? 0) > 0 || region === regionFilter),
    [allRegions, filterFacets.region.counts, regionFilter],
  );

  const visibleQuests = useMemo(() => {
    const filtered = quests.filter((quest) => matchesQuestFilters(quest));
    if (exclusiveFilter !== "yes") return filtered;
    return [...filtered].sort((left, right) => {
      const groupOrder = getExclusiveGroup(left).localeCompare(getExclusiveGroup(right), "zh-CN", { numeric: true });
      if (groupOrder) return groupOrder;
      const routeOrder = left.exclusiveRoute.localeCompare(right.exclusiveRoute, "zh-CN", { numeric: true });
      return routeOrder || left.id.localeCompare(right.id, "zh-CN", { numeric: true });
    });
  }, [exclusiveFilter, matchesQuestFilters, quests]);
  const totalPages = Math.max(1, Math.ceil(visibleQuests.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageStart = (activePage - 1) * pageSize;
  const pagedQuests = visibleQuests.slice(pageStart, pageStart + pageSize);
  const paginationItems = getPaginationItems(activePage, totalPages);
  const selectedQuest = visibleQuests.find((quest) => quest.id === selectedId) ?? pagedQuests[0];
  const markingQuest = quests.find((quest) => quest.id === markingQuestId);
  const selectedExclusiveInfo = selectedQuest ? exclusiveInfoById.get(selectedQuest.id) : undefined;
  const originalExclusivePeerId = originalId
    ? exclusiveInfoById.get(originalId)?.peers[0]?.id ?? ""
    : "";
  const selectedExclusivePeer = quests.find((quest) => quest.id === exclusivePeerId);
  const exclusivePeerMatches = exclusivePeerQuery.trim() && !exclusivePeerId
    ? quests
      .filter((quest) => quest.game === editingQuest.game)
      .filter((quest) => quest.id !== originalId && quest.id !== editingQuest.id)
      .filter((quest) => {
        const name = quest.name.toLowerCase();
        return exclusivePeerQuery.trim().toLowerCase().split(/\s+/).every((term) => name.includes(term));
      })
      .sort((left, right) => {
        const leftLocked = left.isExclusive && left.id !== originalExclusivePeerId;
        const rightLocked = right.isExclusive && right.id !== originalExclusivePeerId;
        return Number(leftLocked) - Number(rightLocked) || left.id.localeCompare(right.id, "zh-CN", { numeric: true });
      })
      .slice(0, 10)
    : [];

  function openNewQuest() {
    setOriginalId(null);
    setExclusivePeerId("");
    setExclusivePeerQuery("");
    setEditingQuest({
      ...emptyQuest,
      game: gameFilter,
      type: questTypesByGame[gameFilter][0],
      chapter: gameFilter === "XC1" ? withXC1Arc(emptyQuest.chapter, arcFilter === "futureConnected" ? "futureConnected" : "main") : gameFilter === "XCX" ? "终极版 · 随剧情开放" : "本篇 · 随剧情开放",
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setQuestNotesView("write");
    setEditorOpen(true);
  }

  function changeGameFilter(game: GameCode) {
    setGameFilter(game);
    setQuery("");
    if (game !== "XC1" && (activeModule === "npcs" || activeModule === "locations")) setActiveModule("quests");
    if (game !== "XC2" && (activeModule === "xc2Characters" || activeModule === "xc2Locations")) setActiveModule("quests");
    setMarkerFilter("all");
    setTypeFilter("all");
    setArcFilter(game === "XC1" ? "main" : "all");
    setTimedFilter("all");
    setExclusiveFilter("all");
    setRegionFilter("all");
    setCurrentPage(1);
  }

  function changeArcFilter(arc: QuestArcFilter) {
    setArcFilter(arc);
    if (gameFilter === "XC1") {
      setQuery("");
      setTypeFilter("all");
      setMarkerFilter("all");
      setTimedFilter("all");
      setExclusiveFilter("all");
      setRegionFilter("all");
    }
    setCurrentPage(1);
  }

  function resetQuestFilters() {
    setMarkerFilter("all");
    setTypeFilter("all");
    if (gameFilter !== "XC1") setArcFilter("all");
    setTimedFilter("all");
    setExclusiveFilter("all");
    setRegionFilter("all");
    setQuery("");
    setCurrentPage(1);
  }

  function openNpcFromQuest(questId: string) {
    const npc = npcByQuestId.get(questId);
    if (!npc) return;
    setSelectedNpcId(npc.id);
    setDetailOpen(false);
    setActiveModule("npcs");
  }

  function openQuestFromNpc(questId: string) {
    const quest = quests.find((item) => item.id === questId);
    if (!quest) return;
    setGameFilter(quest.game);
    setActiveModule("quests");
    setMarkerFilter("all");
    setTypeFilter("all");
    setArcFilter(quest.game === "XC1" ? getXC1Arc(quest.chapter) ?? "main" : "all");
    setTimedFilter("all");
    setExclusiveFilter("all");
    setRegionFilter("all");
    setQuery(questId);
    setCurrentPage(1);
    setSelectedId(questId);
    setDetailOpen(true);
  }

  function changeEditingGame(game: GameCode) {
    const nextType = questTypesByGame[game].includes(editingQuest.type)
      ? editingQuest.type
      : questTypesByGame[game][0];
    const nextChapter = game === "XC1" && !getQuestArc({ game, chapter: editingQuest.chapter })
      ? withXC1Arc(editingQuest.chapter, "main")
      : game !== "XC1" && !getQuestArc({ game, chapter: editingQuest.chapter })
        ? withQuestArc(editingQuest.chapter, game === "XCX" ? "definitiveEdition" : "baseGame")
        : editingQuest.chapter;
    setExclusivePeerId("");
    setExclusivePeerQuery("");
    setEditingQuest({
      ...editingQuest,
      game,
      type: nextType,
      chapter: nextChapter,
      markerId: "",
      isTimed: supportsQuestRiskFlags(game) ? editingQuest.isTimed : false,
      isExclusive: false,
      exclusiveGroup: "",
      exclusiveRoute: "",
    });
  }

  function openEditor(quest: Quest) {
    const peer = exclusiveInfoById.get(quest.id)?.peers[0];
    setOriginalId(quest.id);
    setExclusivePeerId(peer?.id ?? "");
    setExclusivePeerQuery(peer ? `${peer.name}（${peer.id}）` : "");
    setEditingQuest({ ...quest });
    setQuestNotesView("write");
    setDetailOpen(false);
    setEditorOpen(true);
  }

  async function saveQuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = editingQuest.id.trim();
    const name = editingQuest.name.trim();
    if (!id || !name) return;
    if (quests.some((quest) => quest.id === id && quest.id !== originalId)) {
      setToast("任务编号已经存在，请换一个编号");
      return;
    }
    if (supportsQuestRiskFlags(editingQuest.game) && editingQuest.isExclusive && !exclusivePeerId) {
      setToast("请先搜索并选择一个互斥任务");
      return;
    }
    const saved: Quest = {
      ...editingQuest,
      id,
      name,
      isTimed: supportsQuestRiskFlags(editingQuest.game) ? editingQuest.isTimed : false,
      isExclusive: supportsQuestRiskFlags(editingQuest.game) ? editingQuest.isExclusive : false,
      exclusiveGroup: supportsQuestRiskFlags(editingQuest.game) ? editingQuest.exclusiveGroup : "",
      exclusiveRoute: supportsQuestRiskFlags(editingQuest.game) ? editingQuest.exclusiveRoute : "",
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setSaving(true);
    try {
      const payload = await requestQuestDatabase("POST", {
        quest: saved,
        originalId,
        exclusivePeerId: saved.isExclusive ? exclusivePeerId : null,
      });
      setQuests(payload.quests ?? []);
      setSelectedId(saved.id);
      setEditorOpen(false);
      setToast(originalId ? "任务资料已写入数据库" : "任务资料已添加到数据库");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function openMarkerPicker(questId: string) {
    setMarkingQuestId(questId);
    setCustomLabelName("");
  }

  async function changeQuestMarker(quest: Quest, markerId: string, markerName?: string) {
    setMarkerSavingId(quest.id);
    try {
      const payload = await requestQuestDatabase("PATCH", { questId: quest.id, markerId });
      if (payload.quest) {
        setQuests((current) => current.map((item) => item.id === payload.quest?.id ? payload.quest : item));
      }
      setMarkingQuestId("");
      setCustomLabelName("");
      const selectedName = markerName ?? questLabelById.get(markerId)?.name;
      setToast(markerId ? `已标记为“${selectedName ?? "自定义标签"}”` : "已取消任务标记");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "更新任务标记失败");
    } finally {
      setMarkerSavingId("");
    }
  }

  async function addCustomLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!markingQuest || !customLabelName.trim()) return;
    setMarkerSavingId(markingQuest.id);
    try {
      const payload = await requestQuestLabels("POST", {
        game: markingQuest.game,
        name: customLabelName.trim(),
      });
      if (!payload.label) throw new Error("创建标签失败");
      setQuestLabels(payload.labels ?? []);
      setMarkerSavingId("");
      await changeQuestMarker(markingQuest, payload.label.id, payload.label.name);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "创建标签失败");
      setMarkerSavingId("");
    }
  }

  async function deleteCustomLabel(label: QuestLabel) {
    if (label.isBuiltIn) return;
    const usageCount = quests.filter((quest) => quest.markerId === label.id).length;
    if (usageCount) {
      setToast(`“${label.name}”正在被 ${usageCount} 个任务使用，请先取消这些任务的标记`);
      return;
    }
    if (!window.confirm(`确定删除自定义标签“${label.name}”吗？`)) return;

    setLabelDeletingId(label.id);
    try {
      const payload = await requestQuestLabels("DELETE", { id: label.id });
      setQuestLabels(payload.labels ?? []);
      if (markerFilter === label.id) setMarkerFilter("all");
      setToast(`自定义标签“${label.name}”已删除`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "删除标签失败");
    } finally {
      setLabelDeletingId("");
    }
  }

  async function readImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportReport(null);
    try {
      const text = await file.text();
      const raw: unknown = file.name.toLowerCase().endsWith(".json")
        ? JSON.parse(text)
        : recordsFromCsv(text);
      const importedQuests = raw && typeof raw === "object"
        ? (raw as { quests?: unknown }).quests
        : undefined;
      const list: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray(importedQuests) ? importedQuests : [];
      const normalized = list
        .map((record) => record && typeof record === "object"
          ? toQuest(record as Record<string, unknown>)
          : null)
        .filter((quest): quest is Quest => Boolean(quest));
      if (!normalized.length) throw new Error("没有找到有效记录");
      const ids = new Set(quests.map((quest) => quest.id));
      const seen = new Set<string>();
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const records: Quest[] = [];
      normalized.forEach((quest) => {
        if (seen.has(quest.id)) {
          skipped += 1;
          return;
        }
        seen.add(quest.id);
        records.push(quest);
        if (ids.has(quest.id)) updated += 1;
        else added += 1;
      });
      setImportReport({ fileName: file.name, added, updated, skipped, records });
    } catch {
      setImportError("文件解析失败，请检查格式以及任务编号、游戏和任务名称字段。");
    }
    event.target.value = "";
  }

  async function commitImport() {
    if (!importReport) return;
    setSaving(true);
    try {
      const payload = await requestQuestDatabase("PUT", { quests: importReport.records });
      setQuests(payload.quests ?? []);
      setImportOpen(false);
      setImportReport(null);
      setToast(`数据库导入完成：新增 ${importReport.added} 条，更新 ${importReport.updated} 条`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "数据库导入失败");
    } finally {
      setSaving(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ version: 2, quests }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `xeno-quests-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("JSON 数据已经导出");
  }

  function downloadTemplate() {
    const header = "任务编号,游戏,任务名称,任务类型,章节,地区,委托人,奖励,前置条件,来源,来源链接,资料状态,是否限时,是否互斥,互斥组,互斥路线,手动备注,任务流程（Markdown）";
    const example = "XC1-Q-0001,XC1,演示任务,支线任务,第 1 章,殖民地 9,演示委托人,演示奖励,,游戏内文本,,待核验,否,否,,,个人记录,请替换为真实资料";
    const blob = new Blob([`\uFEFF${header}\n${example}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quest-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function resetInitialData() {
    if (!window.confirm("确定恢复初始数据吗？当前本地修改会被覆盖。")) return;
    setSaving(true);
    try {
      const payload = await requestQuestDatabase("DELETE");
      const records = payload.quests ?? [];
      setQuests(records);
      setSelectedId(records[0]?.id ?? "");
      setToast("SQLite 数据库已恢复为初始资料");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="archive-app">
      <header className="mobile-app-header">
        <label><span>异度资料库</span><select aria-label="切换作品" value={gameFilter} onChange={(event) => changeGameFilter(event.target.value as GameCode)}>
          {gameCodes.map((game) => <option key={game} value={game}>{gameNames[game]}</option>)}
        </select></label>
        <DataTools compact />
      </header>
      <nav className="mobile-tabbar" aria-label="手机栏目导航">
        {sidebarModulesByGame[gameFilter].filter((module) => module.target).map((module) => (
          <button key={module.id} aria-current={activeModule === module.target ? "page" : undefined}
            onClick={() => { if (module.target) setActiveModule(module.target); window.scrollTo({ top: 0 }); }}>
            <UiIcon name={module.icon} size={21} /><span>{module.label}</span>
          </button>
        ))}
      </nav>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ArchiveLogo /></span>
          <div><strong>异度资料库</strong><small>XENO ARCHIVE</small></div>
        </div>

        <div className="nav-section game-library-section">
          <p className="nav-title"><span>作品资料</span><span>COLLECTION</span></p>
          <nav className="game-library-nav" aria-label="按游戏选择资料">
            {gameCodes.map((game, index) => (
              <div className={`game-library ${gameFilter === game ? "active" : ""}`} key={game}>
                <button
                  className="game-entry"
                  onClick={() => changeGameFilter(game)}
                  aria-expanded={gameFilter === game}
                  aria-controls={`game-modules-${game}`}
                >
                  <span className={`nav-symbol game-${index + 1}`}>{["I", "II", "III", "X"][index]}</span>
                  <span>{gameNames[game]}</span>
                  <b>{quests.filter((quest) => quest.game === game).length || ""}</b>
                  <span className="nav-chevron"><UiIcon name={gameFilter === game ? "chevron-down" : "chevron-right"} size={15} /></span>
                </button>
                {gameFilter === game && (
                  <div className="game-module-nav" id={`game-modules-${game}`} aria-label={`${gameNames[game]}资料功能`}>
                    {sidebarModulesByGame[game].map((module) => (
                      <button
                        className={module.target === activeModule ? "active" : ""}
                        disabled={!module.target}
                        key={module.id}
                        onClick={() => module.target && setActiveModule(module.target)}
                        aria-current={module.target === activeModule ? "page" : undefined}
                      >
                        <span className="line-icon"><UiIcon name={module.icon} size={16} /></span>
                        <span>{module.label}</span>
                        {!module.target && <small>后续</small>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <DataTools />
          <div className="database-card">
            <div className="database-card-title"><span><UiIcon name="database" size={17} /></span><strong>本地资料库</strong></div>
            <p>{gameNames[gameFilter]}{activeModule === "quests" ? "任务资料库" : activeModule === "notes" ? "玩法笔记库" : activeModule === "locations" ? "探索地图册" : activeModule === "xc2Locations" ? "地区与地点目录" : activeModule === "xc2Characters" ? "角色与异刃图鉴" : "人物关联库"}已就绪</p>
            <small>SQLite · 本地保存</small>
            {activeModule === "quests" && <button onClick={resetInitialData} disabled={saving}><UiIcon name="refresh" size={14} />恢复初始数据</button>}
          </div>
        </div>
      </aside>

      <section className="main-shell">
        {activeModule === "locations" && gameFilter === "XC1"
          ? <XC1LocationDirectory
              view={locationView}
              onViewChange={setLocationView}
              quests={quests}
              npcs={xc1Npcs}
              relatedLoading={loading || npcLoading}
              relatedError={databaseError || npcDatabaseError}
              onOpenQuest={openQuestFromNpc}
              onOpenNpc={(id) => { setSelectedNpcId(id); setActiveModule("npcs"); }}
            />
          : activeModule === "xc2Locations" && gameFilter === "XC2"
          ? <XC2LocationDirectory view={xc2LocationView} onViewChange={setXc2LocationView}
              quests={quests} relatedLoading={loading} relatedError={databaseError} onOpenQuest={openQuestFromNpc} />
          : activeModule === "notes"
          ? <GameNotes game={gameFilter} key={gameFilter} onToast={setToast} />
          : activeModule === "xc2Characters" && gameFilter === "XC2"
          ? <XC2CharacterDirectory quests={quests.filter((quest) => quest.game === "XC2")} onOpenQuest={openQuestFromNpc} />
          : activeModule === "npcs"
            ? <XC1NpcDirectory
                npcs={xc1Npcs}
                quests={quests.filter((quest) => quest.game === "XC1")}
                questLabels={questLabels.filter((label) => label.game === "XC1")}
                selectedNpcId={selectedNpcId}
                loading={npcLoading}
                error={npcDatabaseError}
                onSelectNpc={setSelectedNpcId}
                onOpenQuest={openQuestFromNpc}
              />
            : <>
        <header className={`topbar quest-topbar ${mobileActionsOpen ? "mobile-actions-open" : ""}`}>
          <div className="workspace-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>{gameNames[gameFilter]}</strong></div>
          <label className="search-box">
            <span><UiIcon name="search" size={18} /></span>
            <input data-archive-search aria-label="搜索任务名称或编号" value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder={gameFilter === "XCX" ? "搜索任务、英文名、人物或目标" : "搜索任务名称或编号"} />
            <kbd>Ctrl K</kbd>
          </label>
          <button className="mobile-actions-toggle secondary-button" aria-expanded={mobileActionsOpen} aria-controls="quest-actions" onClick={() => setMobileActionsOpen(!mobileActionsOpen)}>操作</button>
          <div className="top-actions" id="quest-actions">
            <button className="secondary-button" onClick={exportJson} disabled={loading}><UiIcon name="download" size={16} />导出任务</button>
            <button className="secondary-button" disabled={loading} onClick={() => { setImportReport(null); setImportError(""); setImportOpen(true); }}><UiIcon name="upload" size={16} />导入任务</button>
            <button className="primary-button" onClick={openNewQuest} disabled={loading}><UiIcon name="plus" size={17} />新建任务</button>
          </div>
        </header>

        <div className={`content quest-content${gameFilter === "XC1" ? " xc1-quest-content" : ""}`}>
          {gameFilter === "XC1" ? (
            <nav className="xc1-quest-editions" aria-label="选择任务篇章">
              {(["main", "futureConnected"] as const).map((arc) => (
                <button key={arc} type="button" aria-pressed={arcFilter === arc} onClick={() => changeArcFilter(arc)}>
                  <span>{arc === "main" ? "本篇" : "相连的未来"}</span>
                  <small>{arc === "main" ? "主线旅程" : "追加篇章"} · {xc1ArcCounts[arc]} 条</small>
                </button>
              ))}
            </nav>
          ) : <section className="page-heading quest-heading">
            <div>
              <h1>任务资料<span className="heading-dot">.</span></h1>
              {gameFilter === "XC2"
                  ? <p>已收录 {gameQuests.length} 条任务 · 本篇 {xc2ArcCounts.baseGame} 条、扩展票追加 {xc2ArcCounts.expansionPass} 条、《黄金之国伊拉》{xc2ArcCounts.torna} 条。</p>
                  : gameFilter === "XC3"
                    ? <p>已收录 {gameQuests.length} 条任务 · 本篇 {xc3ArcCounts.baseGame} 条、扩展票追加 {xc3ArcCounts.expansionPass} 条、《崭新的未来》{xc3ArcCounts.futureRedeemed} 条。</p>
                    : <p>Nintendo Switch · 终极版 · 简体中文 · 已收录 {gameQuests.length} 条任务（含第 13 章）</p>}
            </div>
          </section>}

          {databaseError && <div className="database-error"><strong>数据库连接失败</strong><span>{databaseError}</span></div>}

          <button className="mobile-filter-toggle secondary-button" aria-expanded={mobileFiltersOpen} aria-controls="quest-filters" onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}>
            <UiIcon name="search" size={16} />{mobileFiltersOpen ? "收起筛选" : "筛选任务"}
            {[typeFilter, gameFilter === "XC1" ? "all" : arcFilter, timedFilter, exclusiveFilter, regionFilter, markerFilter].some((value) => value !== "all") && <span> · 已筛选</span>}
          </button>
          <section id="quest-filters" className={`filterbar ${mobileFiltersOpen ? "mobile-filters-open" : ""}`} aria-label="任务筛选">
            <div className="filter-controls">
              <label>任务类型<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setCurrentPage(1); }}>
                <option value="all">全部类型（{filterFacets.type.all}）</option>
                {types.map((type) => <option value={type} key={type}>{type}（{filterFacets.type.counts.get(type) ?? 0}）</option>)}
              </select></label>
              {gameFilter === "XC2" && <label>内容归属<select value={arcFilter} onChange={(event) => changeArcFilter(event.target.value as QuestArcFilter)}>
                <option value="all">全部内容（{filterFacets.arc.all}）</option>
                <option value="baseGame">本篇（{filterFacets.arc.baseGame}）</option>
                <option value="expansionPass">扩展票追加（{filterFacets.arc.expansionPass}）</option>
                <option value="torna">黄金之国伊拉（{filterFacets.arc.torna}）</option>
              </select></label>}
              {gameFilter === "XC3" && <label>内容归属<select value={arcFilter} onChange={(event) => changeArcFilter(event.target.value as QuestArcFilter)}>
                <option value="all">全部内容（{filterFacets.arc.all}）</option>
                <option value="baseGame">本篇（{filterFacets.arc.baseGame}）</option>
                <option value="expansionPass">扩展票追加（{filterFacets.arc.expansionPass}）</option>
                <option value="futureRedeemed">崭新的未来（{filterFacets.arc.futureRedeemed}）</option>
              </select></label>}
              {supportsQuestRiskFlags(gameFilter) && <label>{gameFilter === "XCX" ? "接取期限" : "是否限时"}<select value={timedFilter} onChange={(event) => { setTimedFilter(event.target.value as BinaryQuestFilter); setCurrentPage(1); }}>
                <option value="all">不限（{filterFacets.timed.all}条）</option>
                <option value="yes">是（{filterFacets.timed.yes}条）</option>
                <option value="no">否（{filterFacets.timed.no}条）</option>
              </select></label>}
              {supportsQuestRiskFlags(gameFilter) && <label>是否互斥<select value={exclusiveFilter} onChange={(event) => { setExclusiveFilter(event.target.value as BinaryQuestFilter); setCurrentPage(1); }}>
                <option value="all">不限（{filterFacets.exclusive.all}条）</option>
                <option value="yes">是（{filterFacets.exclusive.yes}条 / {filterFacets.exclusive.groups}组）</option>
                <option value="no">否（{filterFacets.exclusive.no}条）</option>
              </select></label>}
              <label>地区<select value={regionFilter} onChange={(event) => { setRegionFilter(event.target.value); setCurrentPage(1); }}>
                <option value="all">全部地区（{filterFacets.region.all}）</option>
                {regionOptions.map((region) => <option value={region} key={region}>{region}（{filterFacets.region.counts.get(region) ?? 0}）</option>)}
              </select></label>
              <label>标记<select value={markerFilter} onChange={(event) => { setMarkerFilter(event.target.value); setCurrentPage(1); }}>
                <option value="all">全部标记（{filterFacets.marker.all}）</option>
                <option value="unmarked">未标记（{filterFacets.marker.unmarked}）</option>
                {gameQuestLabels.map((label) => <option value={label.id} key={label.id}>{label.name}（{filterFacets.marker.counts.get(label.id) ?? 0}）</option>)}
              </select></label>
            </div>
            <button className="reset-filters" onClick={resetQuestFilters}><UiIcon name="refresh" size={14} />重置筛选</button>
          </section>

          <div className="workspace">
            <section className="records-panel" aria-label="任务目录">
              {gameFilter !== "XC1" && <div className="records-toolbar"><div><UiIcon name="list" size={18} /><h2>任务目录</h2><span className="results-count">{loading ? "读取中" : `${visibleQuests.length} 条`}</span></div><span className="records-hint">点击任务查看详情</span></div>}
              <div className="records-table">
              <div className="records-head">
                <span>任务记录</span><span>类型</span><span>地区</span><span>委托人</span><span>章节 / 进度</span><span>前置条件</span><span>手动备注</span><span>标记</span>
              </div>
              <div className="records-list">
                {loading && <div className="empty-state"><span>◌</span><strong>正在读取 SQLite 数据库</strong><p>首次启动会自动建立表并导入初始任务。</p></div>}
                {pagedQuests.map((quest) => {
                  const exclusiveInfo = exclusiveInfoById.get(quest.id);
                  const linkedNpc = npcByQuestId.get(quest.id);
                  const markerLabel = questLabelById.get(quest.markerId);
                  const chapterProgressLabel = getChapterProgressLabel(quest.chapter, quest.game);
                  const prerequisitesLabel = quest.game === "XC1"
                    ? formatXC1StoryProgress(quest.prerequisites)
                    : quest.prerequisites;
                  const exclusivePeerLabel = exclusiveInfo?.peers
                    .map((peer) => `${peer.name}（${peer.id}）`)
                    .join(" / ");
                  return (
                    <div
                      className={`record-row ${selectedQuest?.id === quest.id ? "selected" : ""}`}
                      key={quest.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedId(quest.id); setDetailOpen(true); }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                        event.preventDefault();
                        setSelectedId(quest.id);
                        setDetailOpen(true);
                      }}
                    >
                      <span className={`quality-icon ${quest.status}`} aria-hidden="true">
                        {quest.status === "complete" ? "✓" : quest.status === "incomplete" ? "!" : quest.status === "pending" ? "?" : "↯"}
                      </span>
                      <span className="record-main">
                        <strong>{quest.name}</strong><small>{quest.id}{gameFilter !== "XC1" && <> · {getQuestArcLabel(quest)}</>}</small>
                        {supportsQuestRiskFlags(quest.game) && (isTimedQuest(quest) || quest.isExclusive) && <span className="quest-flags">
                          {isTimedQuest(quest) && <span className="quest-flag timed">{quest.game === "XCX" ? "接取期限" : "限时"}</span>}
                          {quest.isExclusive && <span className="quest-flag exclusive" title={exclusivePeerLabel ? `与 ${exclusivePeerLabel} 互斥` : "尚未关联互斥任务"}>
                            {exclusivePeerLabel ? `互斥：${exclusivePeerLabel}` : "互斥（未关联）"}
                          </span>}
                        </span>}
                      </span>
                      <span className={`record-type quest-type ${getQuestTypeTone(quest.type)}`}>{quest.type}</span>
                      <span className="record-location"><strong>{quest.region || "地区缺失"}</strong></span>
                      {linkedNpc
                        ? <button
                            type="button"
                            className="record-giver giver-link"
                            onClick={(event) => { event.stopPropagation(); openNpcFromQuest(quest.id); }}
                            title={`查看 ${linkedNpc.name} 的位置、活动时间与关联任务`}
                          >{quest.giver}</button>
                        : <span className="record-giver">{quest.giver || "未填写"}</span>}
                      <span className="record-progress" title={chapterProgressLabel}>{chapterProgressLabel || "来源未标注"}</span>
                      <span className="record-prerequisites" title={prerequisitesLabel}>{prerequisitesLabel || "—"}</span>
                      <span className="record-manual-notes" title={quest.manualNotes}>{quest.manualNotes || "—"}</span>
                      <span className="record-marker">
                        <button
                          type="button"
                          className={`marker-trigger ${markerLabel ? "marked" : "unmarked"}`}
                          style={markerLabel ? {
                            color: markerLabel.color,
                            backgroundColor: `${markerLabel.color}16`,
                            borderColor: `${markerLabel.color}55`,
                          } : undefined}
                          disabled={markerSavingId === quest.id}
                          onClick={(event) => { event.stopPropagation(); openMarkerPicker(quest.id); }}
                          aria-label={`设置“${quest.name}”的标记`}
                        >
                          {markerLabel && <i style={{ backgroundColor: markerLabel.color }} />}
                          <span>{markerLabel?.name ?? "未标记"}</span>
                        </button>
                      </span>
                    </div>
                  );
                })}
                {!loading && !visibleQuests.length && (
                  <div className="empty-state"><span>⌕</span><strong>没有匹配的任务</strong><p>尝试修改搜索词或筛选条件。</p></div>
                )}
              </div>
              </div>
              {!loading && visibleQuests.length > 0 && <footer className="records-footer">
                <p>共 <strong>{visibleQuests.length}</strong> 条记录</p>
                <label>每页显示<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}>
                  <option value="10">10</option><option value="20">20</option><option value="50">50</option>
                </select>条</label>
                <nav className={`pagination${gameFilter === "XC1" ? " xc1-desktop-pagination" : ""}`} aria-label="任务列表分页">
                  <button disabled={activePage === 1} onClick={() => setCurrentPage(Math.max(1, activePage - 1))} aria-label="上一页"><UiIcon name="chevron-left" size={15} /></button>
                  {paginationItems.map((item) => typeof item === "number"
                    ? <button className={item === activePage ? "active" : ""} key={item} onClick={() => setCurrentPage(item)} aria-current={item === activePage ? "page" : undefined}>{item}</button>
                    : <span key={item}>…</span>)}
                  <button disabled={activePage === totalPages} onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))} aria-label="下一页"><UiIcon name="chevron-right" size={15} /></button>
                </nav>
                {gameFilter === "XC1" && <nav className="xc1-phone-pagination" aria-label="任务列表分页">
                  <button type="button" disabled={activePage === 1} onClick={() => setCurrentPage(activePage - 1)}><UiIcon name="chevron-left" size={16} />上一页</button>
                  <span aria-live="polite"><strong>{activePage}</strong><span> / {totalPages} 页</span></span>
                  <button type="button" disabled={activePage === totalPages} onClick={() => setCurrentPage(activePage + 1)}>下一页<UiIcon name="chevron-right" size={16} /></button>
                </nav>}
              </footer>}
            </section>

            {detailOpen && selectedQuest && (
              <div className="modal-backdrop detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailOpen(false); }}>
              <section className="detail-modal" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="quest-detail-title">
                <div className="detail-heading">
                  <div><span className="game-kicker">{gameNames[selectedQuest.game]} · {getQuestArcLabel(selectedQuest)}</span><h2 id="quest-detail-title">{selectedQuest.name}</h2><code>{selectedQuest.id}</code></div>
                  <button type="button" className="close-button" aria-label="关闭任务详情" onClick={() => setDetailOpen(false)}><UiIcon name="close" size={17} /></button>
                </div>

                <div className="detail-modal-body">
                <section className="detail-section basic-section">
                  <h3><UiIcon name="info" size={15} />基本信息</h3>
                  <div className="detail-grid">
                    <div><span>篇章</span><strong>{getQuestArcLabel(selectedQuest)}</strong></div>
                    <div><span>地区</span><strong>{selectedQuest.region || "未填写"}</strong></div>
                    <div><span>委托人</span>{npcByQuestId.has(selectedQuest.id)
                      ? <button type="button" className="detail-giver-link giver-link" onClick={() => openNpcFromQuest(selectedQuest.id)}>
                          {selectedQuest.giver}<UiIcon name="chevron-right" size={13} />
                        </button>
                      : <strong>{selectedQuest.giver || "未填写"}</strong>}</div>
                    <div><span>类型</span><strong className={`quest-type ${getQuestTypeTone(selectedQuest.type)}`}>{selectedQuest.type}</strong></div>
                    {supportsQuestRiskFlags(selectedQuest.game) && <div><span>{selectedQuest.game === "XCX" ? "接取期限" : "是否限时"}</span><strong>{isTimedQuest(selectedQuest) ? "有，请查看前置条件" : "无已知限制"}</strong></div>}
                    {supportsQuestRiskFlags(selectedQuest.game) && <div><span>是否互斥</span><strong>{selectedQuest.isExclusive ? "是" : "否"}</strong></div>}
                    <div className="detail-grid-wide"><span>章节 / 进度</span><strong>{getChapterProgressLabel(selectedQuest.chapter, selectedQuest.game) || "来源未标注"}</strong></div>
                    <div className="detail-grid-wide"><span>前置条件</span><strong>{selectedQuest.game === "XC1" ? formatXC1StoryProgress(selectedQuest.prerequisites) || "—" : selectedQuest.prerequisites || "—"}</strong></div>
                    {supportsQuestRiskFlags(selectedQuest.game) && selectedExclusiveInfo?.peers.length ? <div className="detail-grid-wide"><span>互斥任务</span><strong>{selectedExclusiveInfo.peers.map((peer) => `${peer.name}（${peer.id}）`).join(" / ")}</strong></div> : null}
                  </div>
                </section>

                <section className="detail-section reward-section">
                  <h3><UiIcon name="gift" size={15} />奖励</h3>
                  <p>{selectedQuest.reward || "未填写"}</p>
                </section>

                <section className="detail-section audit-section">
                  <div className="section-title"><h3><UiIcon name="shield-check" size={15} />资料检查</h3><span className={`status-label ${selectedQuest.status}`}>{statusMeta[selectedQuest.status].label}</span></div>
                  <ul className="issue-list">
                    {getIssues(selectedQuest).length ? getIssues(selectedQuest).map((issue) => <li key={issue}><UiIcon name="alert" size={15} />{issue}</li>) : <li className="passed"><UiIcon name="check" size={16} />必填资料已经齐全</li>}
                  </ul>
                </section>

                <section className="detail-section source-section">
                  <h3><UiIcon name="file" size={15} />来源与备注</h3>
                  <dl>
                    <div><dt>资料来源</dt><dd>{selectedQuest.source || "未填写"}</dd></div>
                    <div><dt>最后更新</dt><dd>{selectedQuest.updatedAt}</dd></div>
                  </dl>
                  {selectedQuest.sourceUrl && <a className="source-link" href={selectedQuest.sourceUrl} target="_blank" rel="noreferrer">查看原始资料 <UiIcon name="link" size={13} /></a>}
                  {selectedQuest.manualNotes && <div className="note-block"><strong>手动备注</strong><p>{selectedQuest.manualNotes}</p></div>}
                  {selectedQuest.notes && <div className="note-block task-flow-block"><strong>{selectedQuest.game === "XC1" ? "核验备注" : "任务流程"}</strong><MarkdownPreview content={selectedQuest.notes} compact /></div>}
                </section>
                </div>

                <footer className="detail-modal-footer">
                  <button className="secondary-button" onClick={() => setDetailOpen(false)}>关闭</button>
                  <button className="primary-button detail-edit" onClick={() => openEditor(selectedQuest)}><UiIcon name="edit" size={15} />编辑并补全资料</button>
                </footer>
              </section>
              </div>
            )}
          </div>
        </div>
        </>}
      </section>

      {editorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <section className="modal editor-modal" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="editor-title">
            <div className="modal-heading"><div><p className="eyebrow">MANUAL EDIT</p><h2 id="editor-title">{originalId ? "编辑任务资料" : "新建任务资料"}</h2><p>保存时会检查任务编号以及必填字段。</p></div><button type="button" className="close-button" onClick={() => setEditorOpen(false)} aria-label="关闭"><UiIcon name="close" size={17} /></button></div>
            <form onSubmit={saveQuest}>
              <div className="form-grid">
                <label>任务编号<input required value={editingQuest.id} onChange={(event) => setEditingQuest({ ...editingQuest, id: event.target.value })} placeholder="例如 XC1-Q-0001" /></label>
                <label>所属游戏<select value={editingQuest.game} onChange={(event) => changeEditingGame(event.target.value as GameCode)}>
                  {gameCodes.map((game) => <option value={game} key={game}>{gameNames[game]}</option>)}
                </select></label>
                <label className="full">任务名称<input required value={editingQuest.name} onChange={(event) => setEditingQuest({ ...editingQuest, name: event.target.value })} /></label>
                <label>任务类型<select value={editingQuest.type} onChange={(event) => setEditingQuest({ ...editingQuest, type: event.target.value })}>
                  {[...questTypesByGame[editingQuest.game], ...(questTypesByGame[editingQuest.game].includes(editingQuest.type) ? [] : [editingQuest.type])]
                    .map((type) => <option value={type} key={type}>{type}</option>)}
                </select></label>
                <label>资料状态<select value={editingQuest.status} onChange={(event) => setEditingQuest({ ...editingQuest, status: event.target.value as QualityStatus })}>
                  {taskQualityStatuses.map((status) => <option value={status} key={status}>{statusMeta[status].label}</option>)}
                </select></label>
                {supportsQuestRiskFlags(editingQuest.game) && <label>{editingQuest.game === "XCX" ? "接取期限" : "是否限时"}<select value={editingQuest.isTimed ? "yes" : "no"} onChange={(event) => setEditingQuest({ ...editingQuest, isTimed: event.target.value === "yes" })}>
                  <option value="no">否</option><option value="yes">是</option>
                </select></label>}
                {supportsQuestRiskFlags(editingQuest.game) && <label>是否互斥<select value={editingQuest.isExclusive ? "yes" : "no"} onChange={(event) => {
                  const isExclusive = event.target.value === "yes";
                  setEditingQuest({
                    ...editingQuest,
                    isExclusive,
                    ...(!isExclusive ? { exclusiveGroup: "", exclusiveRoute: "" } : {}),
                  });
                  if (!isExclusive) {
                    setExclusivePeerId("");
                    setExclusivePeerQuery("");
                  }
                }}>
                  <option value="no">否</option><option value="yes">是</option>
                </select></label>}
                {supportsQuestRiskFlags(editingQuest.game) && editingQuest.isExclusive && <div className="form-field full exclusive-picker">
                  <label htmlFor="exclusive-peer-search">互斥任务</label>
                  <input
                    id="exclusive-peer-search"
                    value={exclusivePeerQuery}
                    onChange={(event) => { setExclusivePeerQuery(event.target.value); setExclusivePeerId(""); }}
                    placeholder="输入任务名称搜索"
                    autoComplete="off"
                  />
                  {selectedExclusivePeer && <div className="selected-peer">
                    <span><strong>{selectedExclusivePeer.name}</strong><small>{selectedExclusivePeer.id} · {selectedExclusivePeer.region}</small></span>
                    <button type="button" onClick={() => { setExclusivePeerId(""); setExclusivePeerQuery(""); }}>重新选择</button>
                  </div>}
                  {exclusivePeerQuery.trim() && !exclusivePeerId && <div className="peer-results">
                    {exclusivePeerMatches.map((candidate) => {
                      const locked = candidate.isExclusive && candidate.id !== originalExclusivePeerId;
                      const lockedPeer = exclusiveInfoById.get(candidate.id)?.peers[0];
                      return <button
                        type="button"
                        key={candidate.id}
                        disabled={locked}
                        onClick={() => {
                          setExclusivePeerId(candidate.id);
                          setExclusivePeerQuery(`${candidate.name}（${candidate.id}）`);
                        }}
                      >
                        <span><strong>{candidate.name}</strong><small>{candidate.id} · {candidate.region || "地区未填"} · {candidate.giver || "委托人未填"}</small></span>
                        <em>{locked ? `已与 ${lockedPeer?.name ?? "其他任务"} 互斥` : "选择"}</em>
                      </button>;
                    })}
                    {!exclusivePeerMatches.length && <p>没有匹配的任务</p>}
                  </div>}
                  <p className="field-hint">组编号和 A/B 路线会自动生成；已与其他任务互斥的记录不能直接选择。</p>
                </div>}
                {editingQuest.game === "XC1" && <label>篇章<select value={getXC1Arc(editingQuest.chapter) ?? "main"} onChange={(event) => setEditingQuest({ ...editingQuest, chapter: withXC1Arc(editingQuest.chapter, event.target.value as XC1Arc) })}>
                  <option value="main">本篇</option>
                  <option value="futureConnected">相连的未来</option>
                </select></label>}
                {editingQuest.game === "XC2" && <label>内容归属<select value={getQuestArc(editingQuest) ?? "baseGame"} onChange={(event) => setEditingQuest({ ...editingQuest, chapter: withQuestArc(editingQuest.chapter, event.target.value as QuestArc) })}>
                  <option value="baseGame">本篇</option>
                  <option value="expansionPass">扩展票追加</option>
                  <option value="torna">黄金之国伊拉</option>
                </select></label>}
                {editingQuest.game === "XC3" && <label>内容归属<select value={getQuestArc(editingQuest) ?? "baseGame"} onChange={(event) => setEditingQuest({ ...editingQuest, chapter: withQuestArc(editingQuest.chapter, event.target.value as QuestArc) })}>
                  <option value="baseGame">本篇</option>
                  <option value="expansionPass">扩展票追加</option>
                  <option value="futureRedeemed">崭新的未来</option>
                </select></label>}
                <label>章节 / 进度<input value={getChapterProgress(editingQuest.chapter)} onChange={(event) => setEditingQuest({
                  ...editingQuest,
                  chapter: editingQuest.game === "XC1"
                    ? withXC1Arc(event.target.value, getXC1Arc(editingQuest.chapter) ?? "main")
                    : withQuestArc(event.target.value, getQuestArc(editingQuest) ?? (editingQuest.game === "XCX" ? "definitiveEdition" : "baseGame")),
                })} />{editingQuest.game === "XC1" && getChapterProgressLabel(editingQuest.chapter, editingQuest.game) !== getChapterProgress(editingQuest.chapter) && (
                  <small className="field-hint">页面显示：{getChapterProgressLabel(editingQuest.chapter, editingQuest.game)}</small>
                )}</label>
                <label>地区<input value={editingQuest.region} onChange={(event) => setEditingQuest({ ...editingQuest, region: event.target.value })} /></label>
                <label>委托人<input value={editingQuest.giver} onChange={(event) => setEditingQuest({ ...editingQuest, giver: event.target.value })} /></label>
                <label>奖励<input value={editingQuest.reward} onChange={(event) => setEditingQuest({ ...editingQuest, reward: event.target.value })} /></label>
                <label className="full">前置条件<input value={editingQuest.prerequisites} onChange={(event) => setEditingQuest({ ...editingQuest, prerequisites: event.target.value })} /></label>
                <label>资料来源<input value={editingQuest.source} onChange={(event) => setEditingQuest({ ...editingQuest, source: event.target.value })} placeholder="攻略本、游戏内文本、网站等" /></label>
                <label>来源链接<input type="url" value={editingQuest.sourceUrl} onChange={(event) => setEditingQuest({ ...editingQuest, sourceUrl: event.target.value })} placeholder="https://" /></label>
                <label className="full">手动备注<textarea value={editingQuest.manualNotes} onChange={(event) => setEditingQuest({ ...editingQuest, manualNotes: event.target.value })} rows={3} placeholder="记录个人进度、选择或提醒" /></label>
                <div className="form-field full task-markdown-editor">
                  <div className="task-markdown-editor-heading">
                    <div><label htmlFor="quest-notes-markdown">{editingQuest.game === "XC1" ? "核验备注（Markdown）" : "任务流程（Markdown）"}</label><small>支持标题、有序/无序列表、粗体、链接、表格和代码块</small></div>
                    <div className="editor-view-tabs" role="group" aria-label="任务流程编辑器视图">
                      <button type="button" className={questNotesView === "write" ? "active" : ""} onClick={() => setQuestNotesView("write")}>编辑</button>
                      <button type="button" className={questNotesView === "preview" ? "active" : ""} onClick={() => setQuestNotesView("preview")}>预览</button>
                    </div>
                  </div>
                  {questNotesView === "write"
                    ? <textarea id="quest-notes-markdown" value={editingQuest.notes} onChange={(event) => setEditingQuest({ ...editingQuest, notes: event.target.value })} rows={10} spellCheck={false} placeholder="## 任务说明&#10;&#10;任务内容&#10;&#10;## 任务流程&#10;&#10;1. 第一步" />
                    : <div className="task-markdown-preview"><MarkdownPreview content={editingQuest.notes} compact /></div>}
                </div>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditorOpen(false)}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "正在写入…" : "保存任务资料"}</button></div>
            </form>
          </section>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportOpen(false); }}>
          <section className="modal import-modal" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="import-title">
            <div className="modal-heading"><div><p className="eyebrow">DATA IMPORT</p><h2 id="import-title">导入任务资料</h2><p>支持 JSON 和 CSV，导入前会预览新增、更新与跳过数量。</p></div><button type="button" className="close-button" onClick={() => setImportOpen(false)} aria-label="关闭"><UiIcon name="close" size={17} /></button></div>
            {!importReport ? (
              <>
                <label className="dropzone">
                  <input type="file" accept=".json,.csv" onChange={readImportFile} />
                  <span className="upload-mark" aria-hidden="true">↑</span>
                  <strong>选择 JSON 或 CSV 文件</strong>
                  <p>必须包含任务编号、游戏和任务名称；相同编号会更新已有记录。</p>
                </label>
                {importError && <p className="form-error">{importError}</p>}
                <div className="import-help"><h3>支持的字段</h3><p>任务编号、游戏、任务名称、任务类型、章节、地区、委托人、奖励、前置条件、来源、来源链接、资料状态、备注。</p></div>
                <div className="modal-actions"><button className="secondary-button" onClick={downloadTemplate}>下载 CSV 模板</button><button className="secondary-button" onClick={() => setImportOpen(false)}>取消</button></div>
              </>
            ) : (
              <>
                <div className="import-file"><span>文</span><div><strong>{importReport.fileName}</strong><p>{importReport.records.length} 条有效记录等待导入</p></div></div>
                <div className="import-summary">
                  <div><span>新增</span><strong>{importReport.added}</strong></div>
                  <div><span>更新</span><strong>{importReport.updated}</strong></div>
                  <div><span>跳过</span><strong>{importReport.skipped}</strong></div>
                </div>
                <p className="import-note">更新会以任务编号为依据覆盖同编号的资料；本次操作不会影响其他记录。</p>
                <div className="modal-actions"><button className="secondary-button" onClick={() => setImportReport(null)}>重新选择</button><button className="primary-button" onClick={commitImport} disabled={saving}>{saving ? "正在写入…" : "确认导入"}</button></div>
              </>
            )}
          </section>
        </div>
      )}

      {markingQuest && (
        <div className="modal-backdrop marker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMarkingQuestId(""); }}>
          <section className="marker-dialog" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="marker-dialog-title">
            <div className="marker-dialog-heading">
              <div><p className="eyebrow">QUEST MARK</p><h2 id="marker-dialog-title">设置任务标记</h2><p>{markingQuest.name}</p></div>
              <button type="button" className="close-button" onClick={() => setMarkingQuestId("")} aria-label="关闭标记选择"><UiIcon name="close" size={17} /></button>
            </div>
            <div className="marker-options" role="listbox" aria-label="可用标签">
              {questLabels.filter((label) => label.game === markingQuest.game).map((label) => {
                const usageCount = quests.filter((quest) => quest.markerId === label.id).length;
                return <div className={`marker-option ${markingQuest.markerId === label.id ? "active" : ""}`} key={label.id}>
                  <button
                    type="button"
                    className="marker-option-select"
                    disabled={markerSavingId === markingQuest.id || labelDeletingId === label.id}
                    onClick={() => changeQuestMarker(markingQuest, label.id, label.name)}
                    role="option"
                    aria-selected={markingQuest.markerId === label.id}
                  >
                    <i style={{ backgroundColor: label.color }} />
                    <span><strong>{label.name}</strong><small>{label.isBuiltIn ? "内置标签" : usageCount ? `${usageCount} 个任务正在使用` : "自定义标签 · 可删除"}</small></span>
                    {markingQuest.markerId === label.id && <b>✓</b>}
                  </button>
                  {!label.isBuiltIn && <button
                    type="button"
                    className="delete-marker-label"
                    disabled={usageCount > 0 || labelDeletingId === label.id}
                    onClick={() => deleteCustomLabel(label)}
                    title={usageCount ? `有 ${usageCount} 个任务正在使用，不能删除` : `删除“${label.name}”`}
                    aria-label={usageCount ? `“${label.name}”正在使用，不能删除` : `删除自定义标签“${label.name}”`}
                  >{labelDeletingId === label.id ? "…" : "删除"}</button>}
                </div>;
              })}
            </div>
            <form className="custom-label-form" onSubmit={addCustomLabel}>
              <label htmlFor="custom-label-name">新建自定义标签</label>
              <div><input id="custom-label-name" value={customLabelName} maxLength={20} onChange={(event) => setCustomLabelName(event.target.value)} placeholder="例如：二周目、稍后处理" /><button type="submit" disabled={!customLabelName.trim() || markerSavingId === markingQuest.id}>添加并标记</button></div>
              <small>系统会自动分配一个与现有标签不同的颜色。</small>
            </form>
            <div className="marker-dialog-actions">
              <button type="button" className="clear-marker" disabled={!markingQuest.markerId || markerSavingId === markingQuest.id} onClick={() => changeQuestMarker(markingQuest, "")}>取消标记</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
