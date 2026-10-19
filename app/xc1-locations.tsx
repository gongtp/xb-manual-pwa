"use client";
import { dataFetch } from "../lib/data-client";

import { useEffect, useMemo, useRef, useState } from "react";
import { xc1Atlas, xc1RegionGuides } from "../lib/xc1-location-data";
import {
  locationKindNames, matchesLocationFilters, nearbyLandmarks, npcsAtLocation, projectLocations,
  questBelongsToRegion, type XC1LocationArc, type XC1LocationFilters, type XC1LocationProgress,
} from "../lib/xc1-location";
import type { Quest } from "../lib/quest";
import type { XC1Npc } from "../lib/xc1-npc";
import { UiIcon } from "./ui-icons";
import "./xc1-locations.css";

export type XC1LocationView = {
  arc: XC1LocationArc;
  regionId: string;
  locationId: string;
  filters: XC1LocationFilters;
};
const emptyFilters: XC1LocationFilters = { query: "", kind: "all", visited: "all", bookmarked: false };
export const initialLocationView: XC1LocationView = {
  arc: "main", regionId: "XC1-REGION-02", locationId: "", filters: emptyFilters,
};
type Props = {
  view: XC1LocationView;
  onViewChange: (view: XC1LocationView) => void;
  quests: Quest[];
  npcs: XC1Npc[];
  relatedLoading: boolean;
  relatedError: string;
  onOpenQuest: (id: string) => void;
  onOpenNpc: (id: string) => void;
};

function Star({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2-4.5-4.4 6.3-.9Z" /></svg>;
}

export default function XC1LocationDirectory({ view, onViewChange, quests, npcs, relatedLoading, relatedError, onOpenQuest, onOpenNpc }: Props) {
  const [progress, setProgress] = useState<Record<string, XC1LocationProgress>>({});
  const [loading, setLoading] = useState(true);
  const [progressReady, setProgressReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { filters, arc } = view;

  useEffect(() => {
    const controller = new AbortController();
    dataFetch("/api/xc1-locations", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (!controller.signal.aborted) {
          setProgress(Object.fromEntries((payload.progress as XC1LocationProgress[]).map((entry) => [entry.id, entry])));
          setProgressReady(true);
        }
      })
      .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message || "探索记录读取失败。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const arcRegions = useMemo(() => xc1Atlas.regions.filter((region) => region.arc === arc), [arc]);
  const arcLocations = useMemo(() => {
    const ids = new Set(arcRegions.map((region) => region.id));
    return xc1Atlas.locations.filter((location) => ids.has(location.regionId));
  }, [arcRegions]);
  const matchingByRegion = useMemo(() => new Map(arcRegions.map((region) => [region.id,
    arcLocations.filter((location) => location.regionId === region.id && matchesLocationFilters(location, region,
      progressReady ? filters : { ...filters, visited: "all", bookmarked: false }, progress[location.id])),
  ])), [arcLocations, arcRegions, filters, progress, progressReady]);
  const visibleRegions = arcRegions.filter((region) => matchingByRegion.get(region.id)?.length);
  const region = visibleRegions.find((item) => item.id === view.regionId) ?? visibleRegions[0];
  const regionLocations = arcLocations.filter((location) => location.regionId === region?.id);
  const visibleLocations = matchingByRegion.get(region?.id ?? "") ?? [];
  const selected = visibleLocations.find((location) => location.id === view.locationId) ?? visibleLocations[0];
  const guide = region ? xc1RegionGuides[region.id] : undefined;
  const markers = useMemo(() => projectLocations(regionLocations), [regionLocations]);
  const visibleIds = new Set(visibleLocations.map((item) => item.id));
  const visitedCount = arcLocations.filter((item) => progress[item.id]?.visited).length;
  const regionVisited = regionLocations.filter((item) => progress[item.id]?.visited).length;
  const filterActive = Boolean(filters.query || filters.kind !== "all" || filters.visited !== "all" || filters.bookmarked);
  const matchCount = [...matchingByRegion.values()].reduce((sum, rows) => sum + rows.length, 0);
  const regionQuests = region ? quests.filter((quest) => questBelongsToRegion(quest, region)) : [];
  const nearby = selected ? nearbyLandmarks(selected, regionLocations) : [];
  const relatedNpcs = selected && region ? npcsAtLocation(npcs, selected, region) : [];
  const selectedProgress = selected ? progress[selected.id] : undefined;
  const trackingUnavailable = loading || !progressReady;

  function updateFilters(patch: Partial<XC1LocationFilters>) {
    onViewChange({ ...view, filters: { ...filters, ...patch } });
    listRef.current?.scrollTo({ top: 0 });
  }
  function selectLocation(id: string, fromMap = false) {
    onViewChange({ ...view, regionId: region?.id ?? view.regionId, locationId: id });
    if (fromMap) listRef.current?.querySelector<HTMLElement>(`[data-location-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    if (window.matchMedia("(max-width: 760px)").matches) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      detailRef.current?.focus({ preventScroll: true });
    }
  }
  async function saveProgress(id: string, patch: { visited?: boolean; bookmarked?: boolean }) {
    if (pending.current || trackingUnavailable) return;
    pending.current = true;
    setSaving(id);
    setError("");
    try {
      const response = await dataFetch("/api/xc1-locations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setProgress((current) => ({ ...current, [id]: payload.progress }));
      setAnnouncement(patch.visited !== undefined ? (patch.visited ? "已标记为已探索" : "已取消探索标记") : (patch.bookmarked ? "已加入收藏" : "已取消收藏"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      pending.current = false;
      setSaving("");
    }
  }

  return <div className="xc1-atlas">
    <header className="topbar atlas-topbar">
      <div className="workspace-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>异度神剑 1</strong></div>
      <label className="atlas-search"><UiIcon name="search" size={18} /><input data-archive-search aria-label="搜索地区或地点" placeholder="搜索本篇章的地区、地点或英文名…" value={filters.query} onChange={(event) => updateFilters({ query: event.target.value })} />{filters.query && <button aria-label="清空搜索" onClick={() => updateFilters({ query: "" })}><UiIcon name="close" size={14} /></button>}</label>
      <span className="atlas-edition">终极版 <i /> 简体中文</span>
    </header>

    <div className="atlas-content">
      <section className="atlas-heading">
        <div><h1>地区与地点</h1><p>浏览地区与地标，记录探索足迹，找到下一站。</p></div>
        <div className="atlas-heading-tools">
          <div className="atlas-arcs" role="group" aria-label="地点篇章">
            {(["main", "futureConnected"] as const).map((value) => <button key={value} aria-pressed={arc === value} className={arc === value ? "active" : ""}
              onClick={() => onViewChange({ arc: value, regionId: "", locationId: "", filters: emptyFilters })}>
              {value === "main" ? "本篇" : "相连的未来"}
            </button>)}
          </div>
          <div className="atlas-overall-progress"><span>{loading ? "正在读取探索记录…" : !progressReady ? "探索记录暂不可用" : `已探索 ${visitedCount} / ${arcLocations.length}`}</span><progress aria-label="本篇章探索进度" value={progressReady ? visitedCount : undefined} max={arcLocations.length} /><b>{progressReady ? `${Math.round(visitedCount / arcLocations.length * 100)}%` : "—"}</b></div>
        </div>
      </section>

      <section className="atlas-toolbar" aria-label="地点筛选">
        <label className="atlas-select"><span>类型</span><select aria-label="地点类型" value={filters.kind} onChange={(event) => updateFilters({ kind: event.target.value as XC1LocationFilters["kind"] })}><option value="all">全部类型</option><option value="landmark">地标</option><option value="location">地点</option><option value="secret">秘境</option></select></label>
        <label className="atlas-select"><span>探索</span><select aria-label="探索状态" disabled={trackingUnavailable} value={filters.visited} onChange={(event) => updateFilters({ visited: event.target.value as XC1LocationFilters["visited"] })}><option value="all">全部状态</option><option value="unvisited">未探索</option><option value="visited">已探索</option></select></label>
        <button className={`atlas-bookmark-filter ${filters.bookmarked ? "active" : ""}`} aria-pressed={filters.bookmarked} disabled={trackingUnavailable} onClick={() => updateFilters({ bookmarked: !filters.bookmarked })}><Star filled={filters.bookmarked} />仅收藏</button>
        {filterActive && <button className="atlas-text-button" onClick={() => onViewChange({ ...view, filters: emptyFilters })}><UiIcon name="refresh" size={14} />重置筛选</button>}
        <span className="atlas-toolbar-summary">{filterActive ? `找到 ${matchCount} 个地点` : `${arcRegions.length} 个地区 · ${arcLocations.length} 个地点`}</span>
      </section>

      {error && <div className="atlas-error" role="alert"><UiIcon name="alert" size={17} /><span>{error} 地点资料仍可浏览。</span><button onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1); }}>重新读取</button></div>}
      <span className="atlas-sr-only" role="status">{announcement}</span>

      {!visibleRegions.length ? <section className="atlas-empty"><UiIcon name="search" size={38} /><h2>没有找到匹配的地点</h2><p>当前搜索范围：{arc === "main" ? "本篇" : "相连的未来"}。试试其他关键词，或清除筛选条件。</p><button className="primary-button" onClick={() => onViewChange({ ...view, filters: emptyFilters })}>清除筛选</button></section> :
        <div className="atlas-workspace">
          <nav className="atlas-regions" aria-label="地区目录">
            <header><strong>地区目录</strong><span>{filterActive ? `${visibleRegions.length} / ` : ""}{arcRegions.length}</span></header>
            <div className="atlas-region-scroll">
              {visibleRegions.map((item) => {
                const all = arcLocations.filter((location) => location.regionId === item.id);
                const visited = all.filter((location) => progress[location.id]?.visited).length;
                return <button key={item.id} className={`atlas-region ${item.id === region.id ? "active" : ""}`} aria-current={item.id === region.id ? "true" : undefined}
                  onClick={() => { onViewChange({ ...view, regionId: item.id, locationId: "" }); listRef.current?.scrollTo({ top: 0 }); }}>
                  <span className="atlas-region-index">{String(arcRegions.indexOf(item) + 1).padStart(2, "0")}</span>
                  <span className="atlas-region-label"><strong>{item.name}{item.stage && <small> · {item.stage}</small>}</strong><span>{filterActive ? `${matchingByRegion.get(item.id)?.length} 个匹配` : `${all.length} 个地点`}<i />{trackingUnavailable ? "—" : `${visited} 已探索`}</span></span>
                  {visited === all.length ? <UiIcon name="check" size={15} /> : <UiIcon name="chevron-right" size={14} />}
                </button>;
              })}
            </div>
          </nav>

          <section className="atlas-explorer" aria-label="地区地点">
            <header className="atlas-region-hero">
              <div className="atlas-region-kicker"><span>{arc === "main" ? "本篇" : "相连的未来"} / {region.stage || "探索档案"}</span><span>{String(arcRegions.indexOf(region) + 1).padStart(2, "0")}</span></div>
              <h2>{region.name}</h2><p className="atlas-region-english">{region.englishName}</p><p className="atlas-region-description" title={guide?.description}>{guide?.description}</p>
              {guide?.description && <details className="atlas-mobile-guide"><summary>地区概况<UiIcon name="chevron-down" size={12} /></summary><p>{guide.description}</p></details>}
              <div className="atlas-region-summary"><span>{regionLocations.filter((item) => item.kind === "landmark").length} 地标</span><span>{regionLocations.filter((item) => item.kind === "location").length} 地点</span><span>{regionLocations.filter((item) => item.kind === "secret").length} 秘境</span><span>{trackingUnavailable ? "—" : `${regionVisited} / ${regionLocations.length} 已探索`}</span></div>
            </header>

            <section className="atlas-map-panel" aria-label="地点位置分布">
              <header><strong>地点分布</strong><span>点击标记查看详情</span><span className="atlas-north">↑ N</span></header>
              <div className="atlas-map" role="group" aria-label={`${region.name}平面位置示意图`}>
                {markers.map(({ location, left, top }) => <button key={location.id} title={`${location.name} · ${locationKindNames[location.kind]}`}
                  aria-label={`地图：${location.name}（${locationKindNames[location.kind]}）`} aria-pressed={selected?.id === location.id}
                  disabled={!visibleIds.has(location.id)} onClick={() => selectLocation(location.id, true)}
                  className={`atlas-marker ${location.kind} ${selected?.id === location.id ? "selected" : ""} ${progress[location.id]?.visited ? "visited" : ""}`}
                  style={{ left: `${left}%`, top: `${top}%` }}><span />
                </button>)}
                <span className="atlas-map-caption">{selected?.name}</span>
              </div>
              <div className="atlas-map-legend">{(["landmark", "location", "secret"] as const).map((kind) => <span key={kind}><i className={`atlas-symbol ${kind}`} />{locationKindNames[kind]}</span>)}<small>实际坐标投影 · 无地形路径</small></div>
            </section>

            <div className="atlas-location-list-heading"><strong>探索清单</strong><span role="status">本地区 {visibleLocations.length} 个{filterActive && ` · 全篇章匹配 ${matchCount} 个`}</span></div>
            <div className="atlas-location-list" ref={listRef}>
              {visibleLocations.map((location) => <div data-location-id={location.id} className={`atlas-location-row ${location.id === selected?.id ? "active" : ""}`} key={location.id}>
                <button className="atlas-visit-check" aria-label={`${progress[location.id]?.visited ? "取消探索" : "标记已探索"}：${location.name}`} aria-pressed={Boolean(progress[location.id]?.visited)} disabled={trackingUnavailable || Boolean(saving)} onClick={() => saveProgress(location.id, { visited: !progress[location.id]?.visited })}>{progress[location.id]?.visited && <UiIcon name="check" size={17} />}</button>
                <button className="atlas-location-select" onClick={() => selectLocation(location.id)} aria-pressed={selected?.id === location.id}><span><strong>{location.name}</strong>{progress[location.id]?.bookmarked && <Star filled />}</span><small>{location.englishName}</small></button>
                <span className={`atlas-kind ${location.kind}`}>{locationKindNames[location.kind]}</span>
              </div>)}
            </div>
          </section>

          {selected && <aside className="atlas-detail" ref={detailRef} tabIndex={-1} aria-label="地点详情">
            <header><span>地点档案</span><button className={`atlas-star-button ${selectedProgress?.bookmarked ? "active" : ""}`} aria-label={selectedProgress?.bookmarked ? "取消收藏此地点" : "收藏此地点"} aria-pressed={Boolean(selectedProgress?.bookmarked)} disabled={trackingUnavailable || Boolean(saving)} onClick={() => saveProgress(selected.id, { bookmarked: !selectedProgress?.bookmarked })}><Star filled={selectedProgress?.bookmarked} /></button></header>
            <div className={`atlas-place-emblem ${selected.kind}`} aria-hidden="true">{selected.kind === "secret" ? <Star /> : <UiIcon name="map" size={27} />}</div>
            <span className={`atlas-kind ${selected.kind}`}>{locationKindNames[selected.kind]}</span>
            <h2>{selected.name}</h2><p className="atlas-detail-english">{selected.englishName}</p>
            <p className="atlas-place-context">{region.name}{region.stage && ` · ${region.stage}`}<br />{selected.kind === "location" ? "普通地点 · 不能作为地标传送" : "地标类 · 发现后通常可作为传送点"}</p>
            <button className={`atlas-discover-button ${selectedProgress?.visited ? "visited" : ""}`} disabled={trackingUnavailable || Boolean(saving)} onClick={() => saveProgress(selected.id, { visited: !selectedProgress?.visited })}><UiIcon name={selectedProgress?.visited ? "check" : "plus"} size={18} />{saving === selected.id ? "正在保存…" : loading ? "正在读取记录…" : !progressReady ? "探索记录暂不可用" : selectedProgress?.visited ? "已探索 · 点击取消" : "标记为已探索"}</button>
            <span className="atlas-autosave">探索与收藏自动保存</span>

            <section className="atlas-detail-section"><h3>首次发现奖励</h3><div className="atlas-rewards"><div><strong>{selected.rewards.exp.toLocaleString()}</strong><span>经验值</span></div><div><strong>{selected.rewards.ap.toLocaleString()}</strong><span>AP</span></div><div><strong>{selected.rewards.sp.toLocaleString()}</strong><span>SP</span></div></div></section>
            <section className="atlas-detail-section"><h3>探索提示</h3><p>{selected.kind === "secret" ? "秘境属于特殊地标，首次发现通常可获得较高奖励。请结合游戏内地图寻找入口。" : selected.kind === "location" ? "到达地点范围后会登记发现；赶路时可以先传送到附近已发现的地标。" : "发现地标可方便后续往返。战斗、剧情或区域状态可能暂时限制传送。"}</p>{region.floors > 1 && <p className="atlas-height-note"><UiIcon name="info" size={14} />本地区有多层地图。平面位置接近不代表可以直接到达。</p>}{guide?.caution && <details className="atlas-caution"><summary><UiIcon name="alert" size={14} />剧情与探索提醒</summary><p>{guide.caution}</p></details>}</section>
            <section className="atlas-detail-section"><h3>附近地标 <small>按平面距离</small></h3>{nearby.length ? <><div className="atlas-nearby">{nearby.map((item) => <button key={item.location.id} onClick={() => { onViewChange({ ...view, regionId: region.id, locationId: item.location.id, filters: emptyFilters }); listRef.current?.scrollTo({ top: 0 }); }}><span className={`atlas-symbol ${item.location.kind}`} /><span>{item.location.name}<small>{Math.abs(item.heightDifference) > 25 ? "有明显高度差" : "请结合地形确认路线"}</small></span><UiIcon name="chevron-right" size={14} /></button>)}</div><p className="atlas-footnote">仅供定位参考，不代表最短步行路线。</p></> : <p>本地区没有其他可参考的地标。</p>}</section>
            <section className="atlas-detail-section"><h3>此处的任务委托人 <small>{relatedNpcs.length}</small></h3>{relatedLoading ? <p>关联资料读取中…</p> : relatedError ? <p>关联资料暂不可用，请刷新页面重试。</p> : relatedNpcs.length ? <div className="atlas-npc-links">{relatedNpcs.map((npc) => <button key={npc.id} onClick={() => onOpenNpc(npc.id)}><UiIcon name="users" size={13} />{npc.name}<UiIcon name="chevron-right" size={12} /></button>)}</div> : <p>现有资料中暂无此处的具名任务委托人。</p>}</section>
            <details className="atlas-region-quests" key={region.id}><summary>本地区任务 <span>{relatedLoading ? "…" : regionQuests.length}</span><UiIcon name="chevron-down" size={14} /></summary>{relatedLoading ? <p>任务资料读取中…</p> : relatedError ? <p>关联资料暂不可用，请刷新页面重试。</p> : regionQuests.length ? <div>{regionQuests.map((quest) => <button key={quest.id} onClick={() => onOpenQuest(quest.id)}><span>{quest.name}<small>{quest.giver}{quest.isTimed ? " · 限时" : ""}</small></span><UiIcon name="chevron-right" size={13} /></button>)}</div> : <p>暂无本地区的任务记录。</p>}</details>
            <footer className="atlas-source"><a href={selected.sourceUrl} target="_blank" rel="noreferrer"><UiIcon name="link" size={13} />查看地点数据来源</a><a href={xc1Atlas.localizationSourceUrl} target="_blank" rel="noreferrer">简体中文本地化来源</a><span>终极版资料 · 更新于 {xc1Atlas.updatedAt}</span></footer>
          </aside>}
        </div>}
    </div>
  </div>;
}
