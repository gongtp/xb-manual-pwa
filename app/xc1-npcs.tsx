"use client";

import { useMemo, useState } from "react";
import type { Quest, QuestLabel } from "../lib/quest";
import type { XC1Npc, XC1NpcArc } from "../lib/xc1-npc";
import { UiIcon } from "./ui-icons";
import "./xc1-npcs.css";

type ArcFilter = "all" | XC1NpcArc;
type RiskFilter = "all" | "timed" | "exclusive";

type Props = {
  npcs: XC1Npc[];
  quests: Quest[];
  questLabels: QuestLabel[];
  selectedNpcId: string;
  loading: boolean;
  error: string;
  onSelectNpc: (npcId: string) => void;
  onOpenQuest: (questId: string) => void;
};

const arcNames: Record<XC1NpcArc, string> = {
  main: "本篇",
  futureConnected: "相连的未来",
};

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export default function XC1NpcDirectory({
  npcs,
  quests,
  questLabels,
  selectedNpcId,
  loading,
  error,
  onSelectNpc,
  onOpenQuest,
}: Props) {
  const [query, setQuery] = useState("");
  const [arcFilter, setArcFilter] = useState<ArcFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const questById = useMemo(() => new Map(quests.map((quest) => [quest.id, quest])), [quests]);
  const labelById = useMemo(() => new Map(questLabels.map((label) => [label.id, label])), [questLabels]);
  const regions = useMemo(() => uniqueValues(
    npcs.flatMap((npc) => npc.appearances.map((appearance) => appearance.region)),
  ), [npcs]);

  const filteredNpcs = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return npcs.filter((npc) => {
      if (arcFilter !== "all" && npc.arc !== arcFilter) return false;
      if (regionFilter !== "all" && !npc.appearances.some((appearance) => appearance.region === regionFilter)) return false;
      const relatedQuests = npc.questIds.map((questId) => questById.get(questId)).filter((quest): quest is Quest => Boolean(quest));
      if (riskFilter === "timed" && !relatedQuests.some((quest) => quest.isTimed)) return false;
      if (riskFilter === "exclusive" && !relatedQuests.some((quest) => quest.isExclusive)) return false;
      if (!terms.length) return true;
      const haystack = [
        npc.name,
        ...npc.appearances.flatMap((appearance) => [
          appearance.region,
          appearance.location,
          appearance.activeTime,
          appearance.condition,
        ]),
        ...relatedQuests.flatMap((quest) => [quest.id, quest.name]),
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [arcFilter, npcs, query, questById, regionFilter, riskFilter]);

  const selectedNpc = filteredNpcs.find((npc) => npc.id === selectedNpcId) ?? filteredNpcs[0];
  const selectedQuests = selectedNpc
    ? selectedNpc.questIds.map((questId) => questById.get(questId)).filter((quest): quest is Quest => Boolean(quest))
    : [];
  function resetFilters() {
    setQuery("");
    setArcFilter("all");
    setRegionFilter("all");
    setRiskFilter("all");
  }

  return <div className="npc-page">
    <header className="topbar npc-topbar">
      <div className="workspace-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>异度神剑 1</strong></div>
      <label className="search-box">
        <span><UiIcon name="search" size={18} /></span>
        <input
          data-archive-search
          aria-label="搜索 NPC、地点或关联任务"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 NPC、地点或关联任务"
        />
      </label>
      <div className="npc-topbar-note"><UiIcon name="users" size={16} />人物档案</div>
    </header>

    <div className="content npc-content">
      <section className="page-heading npc-heading">
        <div>
          <h1>角色与 NPC</h1>
          <p>从人物出发，查找出现地点、活动时间与关联任务。</p>
        </div>
      </section>

      {error && <div className="database-error"><strong>NPC 数据库连接失败</strong><span>{error}</span></div>}

      <section className="filterbar npc-filterbar">
        <div className="filter-controls">
          <label>篇章<select value={arcFilter} onChange={(event) => setArcFilter(event.target.value as ArcFilter)}>
            <option value="all">全部篇章</option>
            <option value="main">本篇</option>
            <option value="futureConnected">相连的未来</option>
          </select></label>
          <label>出现区域<select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
            <option value="all">全部区域</option>
            {regions.map((region) => <option value={region} key={region}>{region}</option>)}
          </select></label>
          <label>收集风险<select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}>
            <option value="all">全部</option>
            <option value="timed">涉及限时任务</option>
            <option value="exclusive">涉及互斥任务</option>
          </select></label>
        </div>
        <p>显示 <strong>{filteredNpcs.length}</strong> / {npcs.length} 名</p>
        {(query || arcFilter !== "all" || regionFilter !== "all" || riskFilter !== "all")
          && <button className="clear-filters" onClick={resetFilters}>清除筛选</button>}
      </section>

      <section className="npc-workspace">
        <div className="npc-list-panel">
          <div className="npc-list-title"><strong>委托人目录</strong><span>{loading ? "读取中…" : `${filteredNpcs.length} 名`}</span></div>
          <div className="npc-list">
            {!loading && !filteredNpcs.length && <div className="npc-empty"><UiIcon name="search" size={28} /><strong>没有匹配的 NPC</strong><p>尝试清除筛选或换一个关键词。</p></div>}
            {filteredNpcs.map((npc) => {
              const related = npc.questIds.map((questId) => questById.get(questId)).filter((quest): quest is Quest => Boolean(quest));
              const hasTimed = related.some((quest) => quest.isTimed);
              const hasExclusive = related.some((quest) => quest.isExclusive);
              return <button
                className={`npc-row ${selectedNpc?.id === npc.id ? "selected" : ""}`}
                aria-pressed={selectedNpc?.id === npc.id}
                key={npc.id}
                onClick={() => onSelectNpc(npc.id)}
              >
                <span className="npc-avatar">{npc.name.slice(0, 1)}</span>
                <span className="npc-row-main">
                  <strong>{npc.name}</strong>
                  <small>{uniqueValues(npc.appearances.map((appearance) => appearance.region)).join(" / ")}</small>
                  <span className="npc-row-meta"><em className={`npc-arc ${npc.arc}`}>{arcNames[npc.arc]}</em><b>{npc.questIds.length} 任务</b>{hasTimed && <i className="risk-timed">限时</i>}{hasExclusive && <i className="risk-exclusive">互斥</i>}</span>
                </span>
                <UiIcon name="chevron-right" size={14} />
              </button>;
            })}
          </div>
        </div>

        <article className="npc-detail-panel">
          {!selectedNpc ? <div className="npc-empty detail"><UiIcon name="users" size={34} /><strong>请选择一名委托人</strong></div> : <>
            <header className="npc-detail-heading">
              <div className="npc-detail-identity">
                <span className="npc-avatar large">{selectedNpc.name.slice(0, 1)}</span>
                <div><p className="npc-file-label">人物档案 <span>{arcNames[selectedNpc.arc]}</span></p><h2>{selectedNpc.name}</h2><div className="npc-identity-meta"><span>{selectedNpc.appearances.length} 处出现记录</span><span>{selectedQuests.length} 个关联任务</span></div></div>
              </div>
              {selectedNpc.sourceUrl && <a href={selectedNpc.sourceUrl} target="_blank" rel="noreferrer"><UiIcon name="link" size={14} />查看资料来源</a>}
            </header>

            <section className="npc-detail-section">
              <div className="npc-section-title"><span><UiIcon name="map" size={16} /></span><div><h3>出现位置与时间</h3><p>随剧情推进或移居变化的地点记录。</p></div></div>
              <div className="npc-appearance-grid">
                {selectedNpc.appearances.map((appearance, index) => <div className="npc-appearance-card" key={`${appearance.region}-${appearance.location}-${index}`}>
                  <span className="npc-appearance-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="npc-place-content">
                    <div className="npc-place-heading"><strong>{appearance.region}</strong></div>
                    <dl className="npc-place-fields">
                      <div><dt>具体位置</dt><dd>{appearance.location}</dd></div>
                      <div><dt>活动时间</dt><dd><UiIcon name="clock" size={14} />{appearance.activeTime}</dd></div>
                    </dl>
                    {appearance.condition && <p className="npc-place-condition">{appearance.condition}</p>}
                  </div>
                </div>)}
              </div>
            </section>

            <section className="npc-detail-section npc-related-section">
              <div className="npc-section-title"><span><UiIcon name="list" size={16} /></span><div><h3>关联任务</h3><p>点击任务可返回任务列表并打开详情。</p></div><b>{selectedQuests.length}</b></div>
              <div className="npc-quest-list">
                {selectedQuests.map((quest) => {
                  const marker = quest.markerId ? labelById.get(quest.markerId) : undefined;
                  const exclusivePeers = quest.isExclusive
                    ? quests.filter((candidate) => candidate.id !== quest.id && candidate.exclusiveGroup === quest.exclusiveGroup)
                    : [];
                  return <button className="npc-quest-row" key={quest.id} onClick={() => onOpenQuest(quest.id)}>
                    <span className="npc-quest-status" style={{ backgroundColor: marker?.color ?? "#d5e4e1" }} />
                    <span className="npc-quest-main">
                      <span><strong>{quest.name}</strong><em>{quest.type}</em></span>
                      <small>{quest.id} · {quest.region}</small>
                      {exclusivePeers.length > 0 && <p>与“{exclusivePeers.map((peer) => peer.name).join("、")}”互斥</p>}
                    </span>
                    <span className="npc-quest-tags">
                      {marker && <i style={{ color: marker.color }}>{marker.name}</i>}
                      {quest.isTimed && <i className="risk-timed">限时</i>}
                      {quest.isExclusive && <i className="risk-exclusive">互斥</i>}
                    </span>
                    <UiIcon name="chevron-right" size={15} />
                  </button>;
                })}
              </div>
            </section>

            <footer className="npc-detail-footer">
              <span className="npc-file-id">{selectedNpc.id}</span>
              <span>来源：{selectedNpc.source}</span>
              <span>更新：{selectedNpc.updatedAt}</span>
              {selectedNpc.notes && <p>{selectedNpc.notes}</p>}
            </footer>
          </>}
        </article>
      </section>
    </div>
  </div>;
}
