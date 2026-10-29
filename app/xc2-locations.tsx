"use client";
import { dataFetch } from "../lib/data-client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  xc2Directory, xc2LocationArcs, xc2LocationKinds, xc2RegionsById, matchesXC2Location, questsMentioningXC2Location,
  type XC2Location, type XC2LocationKind, type XC2LocationProgress, type XC2LocationView,
} from "../lib/xc2-location";
import type { Quest } from "../lib/quest";
import { UiIcon } from "./ui-icons";
import "./xc2-locations.css";

type Props = {
  view: XC2LocationView;
  onViewChange: (view: XC2LocationView) => void;
  quests: Quest[];
  relatedLoading: boolean;
  relatedError: string;
  onOpenQuest: (id: string) => void;
};
const arcs = ["baseGame", "torna"] as const;

function Star({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2-4.5-4.4 6.3-.9Z" /></svg>;
}
function KindMark({ kind }: { kind: XC2LocationKind }) {
  return <span className={`x2l-kind ${kind}`}><i aria-hidden="true" />{xc2LocationKinds[kind]}</span>;
}

function groupLocations(locations: XC2Location[], showRegion: boolean) {
  const groups = new Map<string, { title: string; locations: XC2Location[] }>();
  for (const place of locations) {
    const parent = xc2RegionsById.get(place.regionId)!;
    const key = `${place.regionId}/${place.area}`;
    if (!groups.has(key)) groups.set(key, { title: showRegion ? `${parent.name} · ${xc2LocationArcs[parent.arc]} / ${place.area}` : place.area, locations: [] });
    groups.get(key)!.locations.push(place);
  }
  return [...groups.entries()];
}

export default function XC2LocationDirectory({ view, onViewChange, quests, relatedLoading, relatedError, onOpenQuest }: Props) {
  const [progress, setProgress] = useState<Record<string, XC2LocationProgress>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [savingId, setSavingId] = useState("");
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!detailOpen) return;
    const dialog = detailRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = dialog.closest<HTMLElement>(".main-shell");
    const bodyOverflow = document.body.style.overflow;
    const shellOverflow = shell?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (shell) shell.style.overflow = "hidden";
    const dismissBackdrop = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setDetailOpen(false);
    };
    dialog.addEventListener("click", dismissBackdrop);
    dialog.showModal();
    return () => {
      dialog.removeEventListener("click", dismissBackdrop);
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      if (shell) shell.style.overflow = shellOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [detailOpen]);

  useEffect(() => {
    const controller = new AbortController();
    dataFetch("/api/xc2-locations", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "探索记录读取失败");
        if (!Array.isArray(body.progress)) throw new Error("探索记录格式异常");
        if (!controller.signal.aborted) {
          setProgress(Object.fromEntries((body.progress as XC2LocationProgress[]).map((item) => [item.id, item])));
          setLoadError("");
        }
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "探索记录读取失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const unavailable = loading || Boolean(loadError);
  const scopedRegions = xc2Directory.regions.filter((region) => region.arc === view.arc);
  const scopedPlaces = xc2Directory.locations.filter((place) => xc2RegionsById.get(place.regionId)?.arc === view.arc);
  const basePlaces = useMemo(() => xc2Directory.locations.filter((place) => matchesXC2Location(place,
    { ...view, regionId: "all", kind: "all", progress: "all" })), [view]);
  const matchingRegions = scopedRegions.filter((item) => basePlaces.some((place) => place.regionId === item.id));
  const region = scopedRegions.find((item) => item.id === view.regionId) ?? matchingRegions[0] ?? scopedRegions[0];
  const filtered = basePlaces.filter((place) => place.regionId === region?.id);
  const selected = xc2Directory.locations.find((place) => place.id === detailId);
  const selectedRegion = selected ? xc2RegionsById.get(selected.regionId) : undefined;
  const selectedProgress = selected ? progress[selected.id] : undefined;
  const regionPlaces = region ? scopedPlaces.filter((place) => place.regionId === region.id) : scopedPlaces;
  const visited = regionPlaces.filter((place) => progress[place.id]?.visited).length;
  const arcVisited = scopedPlaces.filter((place) => progress[place.id]?.visited).length;
  const arcPercent = scopedPlaces.length ? Math.round(arcVisited / scopedPlaces.length * 100) : 0;
  const bookmarked = scopedPlaces.filter((place) => progress[place.id]?.bookmarked).length;
  const related = selected ? questsMentioningXC2Location(quests, selected) : [];
  const sameAreaLandmarks = selected ? xc2Directory.locations.filter((place) => place.regionId === selected.regionId && place.area === selected.area && place.travel && place.id !== selected.id) : [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * 10;
  const grouped = groupLocations(filtered.slice(pageStart, pageStart + 10), false);

  function change(patch: Partial<XC2LocationView>) {
    setPage(1);
    onViewChange({ ...view, locationId: "", ...patch });
    listRef.current?.scrollTo({ top: 0 });
  }
  function select(place: XC2Location, fromReference = false) {
    if (!fromReference) onViewChange({ ...view, locationId: place.id });
    setDetailId(place.id);
    setDetailOpen(true);
    setSaveError("");
    setAnnouncement("");
    if (fromReference && detailRef.current) {
      detailRef.current.scrollTop = 0;
      detailRef.current.querySelector<HTMLButtonElement>(".x2l-dialog-header button")?.focus({ preventScroll: true });
    }
  }

  async function save(place: XC2Location, field: "visited" | "bookmarked") {
    if (pending.current || unavailable) return;
    pending.current = true;
    setSavingId(place.id);
    setSaveError("");
    setAnnouncement("");
    const value = !progress[place.id]?.[field];
    try {
      const response = await dataFetch("/api/xc2-locations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: place.id, [field]: value }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败，请重试");
      setProgress((current) => ({ ...current, [place.id]: body.progress }));
      setAnnouncement(`${place.name}：${field === "visited" ? value ? "已标记探索" : "已取消探索标记" : value ? "已加入收藏" : "已取消收藏"}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally { pending.current = false; setSavingId(""); }
  }
  function goToPage(nextPage: number) {
    setPage(Math.max(1, Math.min(nextPage, pageCount)));
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0 });
      if (window.matchMedia("(max-width: 780px)").matches) {
        listRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  }

  return <div className="x2l-directory">
    <header className="x2l-topbar">
      <div className="workspace-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>异度神剑 2</strong></div>
      <label className="x2l-search"><UiIcon name="search" size={18} /><input data-archive-search aria-label="搜索二代地区与地点" placeholder="搜索地区、分区或地点…" value={view.query} onChange={(event) => change({ query: event.target.value, regionId: "all" })} />
        {view.query ? <button aria-label="清空地点搜索" onClick={() => change({ query: "" })}><UiIcon name="close" size={16} /></button> : <kbd>Ctrl K</kbd>}
      </label>
      <span className="x2l-edition"><i />简体中文版</span>
    </header>

    <div className="x2l-content">
      <section className="x2l-heading">
        <div><p className="x2l-eyebrow">ALREST · EXPLORER’S INDEX</p><h1>地区与地点</h1><p className="x2l-subtitle">从云海港口到旅途终点，按地区翻阅每一处足迹。</p></div>
        <div className="x2l-totals"><div><strong>{xc2Directory.regions.length}</strong><span>地区</span></div><div><strong>{xc2Directory.locations.length}</strong><span>地点记录</span></div><div><strong>{xc2Directory.locations.filter((place) => place.kind === "secret").length}</strong><span>秘境</span></div></div>
      </section>
      <div className="x2l-toolbar">
        <div className="x2l-arcs" role="group" aria-label="地点篇章">
          {arcs.map((arc) => <button key={arc} className={view.arc === arc ? "active" : ""} aria-pressed={view.arc === arc} onClick={() => change({ arc, regionId: "all" })}>{xc2LocationArcs[arc]}</button>)}
        </div>
        <div className="x2l-overall-progress">
          <span>{unavailable ? loading ? "正在读取探索记录…" : "探索记录暂不可用" : `已探索 ${arcVisited} / ${scopedPlaces.length}`}</span>
          <progress aria-label="本篇章探索进度" value={unavailable ? undefined : arcVisited} max={scopedPlaces.length || 1} />
          <b>{unavailable ? "—" : `${arcPercent}%`}</b>
        </div>
      </div>
      {loadError && <div className="x2l-error" role="alert">{loadError} <button onClick={() => { setLoading(true); setReload((value) => value + 1); }}>重新读取</button><span>仍可浏览全部地点。</span></div>}
      {saveError && <div className="x2l-error" role="alert">{saveError}，本次修改未保存，请重试。</div>}
      <span className="x2l-sr" role="status">{announcement}</span>

      <label className="x2l-mobile-region"><select aria-label="选择二代地区" value={region?.id ?? ""} onChange={(event) => change({ regionId: event.target.value })}>
        {scopedRegions.map((item) => <option key={item.id} value={item.id}>{item.name}（{basePlaces.filter((place) => place.regionId === item.id).length}）</option>)}
      </select></label>
      <div className="x2l-layout">
        <nav className="x2l-regions" aria-label="二代地区目录">
          <div className="x2l-region-heading"><span>地区目录</span><small>{scopedRegions.length} 个地区</small></div>
          <div className="x2l-region-section">
            {scopedRegions.map((item) => {
              const count = basePlaces.filter((place) => place.regionId === item.id).length;
              const all = scopedPlaces.filter((place) => place.regionId === item.id);
              const complete = !unavailable && all.every((place) => progress[place.id]?.visited);
              return <button key={item.id} className={`x2l-region ${region?.id === item.id ? "active" : ""}`} aria-pressed={region?.id === item.id} onClick={() => change({ regionId: item.id })}>
                <span className="x2l-region-dot" aria-hidden="true">{complete ? <UiIcon name="check" size={12} /> : ""}</span><span>{item.name}</span><b>{count}</b>
              </button>;
            })}
          </div>
          <div className="x2l-region-footer"><Star /><span>{unavailable ? "收藏记录待读取" : `已收藏 ${bookmarked} 处地点`}</span></div>
        </nav>

        <section className="x2l-results" aria-label="地点清单">
          <header className="x2l-region-intro">
            <div className="x2l-intro-kicker"><span>{region ? xc2LocationArcs[region.arc] : "探索目录"}</span><span>{region?.chapter ?? `${scopedRegions.length} 个地区`}</span></div>
            <h2>{region?.name ?? "地区地点"}</h2><p>{region?.description ?? "沿地区与分区逐项查阅。搜索支持多个关键词，例如“古拉 下层”。"}</p>
            <div className="x2l-region-summary">
              <span>{regionPlaces.filter((place) => place.kind === "landmark").length} 地标</span>
              <span>{regionPlaces.filter((place) => place.kind === "location").length} 地点</span>
              <span>{regionPlaces.filter((place) => place.kind === "secret").length} 秘境</span>
              {regionPlaces.some((place) => place.kind === "scene") && <span>{regionPlaces.filter((place) => place.kind === "scene").length} 剧情场景</span>}
              <span>{unavailable ? "探索记录待读取" : `${visited} / ${regionPlaces.length} 已探索`}</span>
            </div>
          </header>
          <div className="x2l-list-heading"><strong>探索清单</strong><span role="status">本地区 {filtered.length} 个{view.query.trim() && ` · 全篇章匹配 ${basePlaces.length} 个`}</span></div>
          <div className="x2l-place-list" ref={listRef}>
            {grouped.map(([key, group]) => <section className="x2l-group" key={key}>
              <h3><UiIcon name="file" size={13} /><span>{group.title}</span><b>{group.locations.length}</b></h3>
              {group.locations.map((place) => <div key={place.id} data-place-id={place.id} className={`x2l-place ${selected?.id === place.id ? "selected" : ""}`}>
                <button className={`x2l-visit ${progress[place.id]?.visited ? "checked" : ""}`} aria-label={`${progress[place.id]?.visited ? "取消探索" : "标记已探索"}：${place.name}`} aria-pressed={Boolean(progress[place.id]?.visited)} disabled={unavailable || Boolean(savingId)} onClick={() => save(place, "visited")}><UiIcon name="check" size={13} /></button>
                <button className="x2l-place-name" aria-haspopup="dialog" onClick={() => select(place)}><strong>{place.name}</strong><small>{place.floor}</small></button>
                <KindMark kind={place.kind} />
                <button className={`x2l-star ${progress[place.id]?.bookmarked ? "filled" : ""}`} aria-label={`${progress[place.id]?.bookmarked ? "取消收藏" : "收藏"}：${place.name}`} aria-pressed={Boolean(progress[place.id]?.bookmarked)} disabled={unavailable || Boolean(savingId)} onClick={() => save(place, "bookmarked")}><Star filled={progress[place.id]?.bookmarked} /></button>
              </div>)}
            </section>)}
            {!filtered.length && <div className="x2l-empty"><UiIcon name="search" size={30} /><h3>没有符合条件的地点</h3><p>试试更短的关键词，或选择其他地区。</p><button onClick={() => change({ regionId: region?.id ?? "all", query: "", kind: "all", progress: "all" })}>清空搜索</button></div>}
          </div>
          {filtered.length > 0 && <nav className="x2l-pagination" aria-label="地点列表分页">
            <button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}><UiIcon name="chevron-left" size={16} />上一页</button>
            <span aria-live="polite">{currentPage} / {pageCount} 页</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>下一页<UiIcon name="chevron-right" size={16} /></button>
          </nav>}
          <footer className="x2l-list-footer"><span>地标与秘境可在发现后传送；部分剧情阶段受限。</span><span>勾选记录到访，星标留待再访。</span></footer>
        </section>

        {detailOpen && <dialog className="x2l-detail x2l-dialog" ref={detailRef} aria-label={selected ? selected.name + "地点详情" : "地点详情"} onCancel={() => setDetailOpen(false)} onClose={() => setDetailOpen(false)}>
          <header className="x2l-dialog-header"><strong>地点详情</strong><button type="button" aria-label="关闭地点详情" onClick={() => setDetailOpen(false)}><UiIcon name="close" size={20} /></button></header>
          {saveError && <div className="x2l-error" role="alert">{saveError}，请重试。</div>}
          <span className="x2l-sr" role="status">{announcement}</span>
          {selected && selectedRegion ? <>
            <div className="x2l-detail-label"><span>地点档案</span><span>{xc2LocationArcs[selectedRegion.arc]}</span></div>
            <div className="x2l-detail-title"><span className={`x2l-emblem ${selected.kind}`} aria-hidden="true">{selected.kind === "secret" ? "✧" : selected.kind === "scene" ? "◇" : "⌖"}</span><KindMark kind={selected.kind} /><h2>{selected.name}</h2><p>{selectedRegion.name} / {selected.area}</p></div>
            <div className="x2l-detail-actions"><button className={selectedProgress?.visited ? "visited" : ""} aria-pressed={Boolean(selectedProgress?.visited)} disabled={unavailable || Boolean(savingId)} onClick={() => save(selected, "visited")}><UiIcon name="check" size={16} />{savingId === selected.id ? "正在保存…" : selectedProgress?.visited ? "已探索" : "标记已探索"}</button><button aria-label={selectedProgress?.bookmarked ? "取消收藏当前地点" : "收藏当前地点"} aria-pressed={Boolean(selectedProgress?.bookmarked)} disabled={unavailable || Boolean(savingId)} onClick={() => save(selected, "bookmarked")}><Star filled={selectedProgress?.bookmarked} />{selectedProgress?.bookmarked ? "已收藏" : "收藏"}</button></div>
            <section className="x2l-detail-section"><h3>位置归属</h3><ol className="x2l-hierarchy"><li><small>地区</small><span>{selectedRegion.name}</span></li><li><small>分区</small><span>{selected.area}</span></li><li><small>层级</small><span>{selected.floor}</span></li><li><small>地点</small><strong>{selected.name}</strong></li></ol></section>
            <section className="x2l-detail-section"><h3>{selected.travel ? "传送查找" : "探索提示"}</h3><p>{selected.travel ? `在游戏内的传送菜单选择「${selectedRegion.name} → ${selected.area}」，查找「${selected.name}」。需要先发现此处，且当前剧情允许传送。` : selected.kind === "scene" ? "这是随剧情进入的场景，没有独立的自由传送入口。可用探索标记记录到访。" : "此处没有独立的自由传送入口。先核对上方分区与层级，再从同分区地标步行探索。"}</p>
              {!selected.discovery && selected.kind !== "scene" && <p className="x2l-muted-note">剧情地点；不会单独触发通常的地点发现提示。</p>}
              {selectedRegion.caution && <div className="x2l-caution"><UiIcon name="info" size={16} /><p>{selectedRegion.caution}</p></div>}
            </section>
            {selected.discovery && <section className="x2l-detail-section"><h3>首次发现奖励</h3><div className="x2l-rewards"><div><strong>{selected.rewards.exp.toLocaleString()}</strong><small>经验值 EXP</small></div><div><strong>{selected.rewards.sp}</strong><small>技能点 SP</small></div><div><strong>{selected.rewards.development}</strong><small>发展度点数</small></div></div></section>}
            {sameAreaLandmarks.length > 0 && <section className="x2l-detail-section"><h3>同分区传送参考 <small>{sameAreaLandmarks.length}</small></h3><p className="x2l-muted-note">用于确认分区，具体道路需结合游戏内环境。</p><div className="x2l-references">{sameAreaLandmarks.map((place) => <button key={place.id} onClick={() => select(place, true)}>{place.name}<UiIcon name="chevron-right" size={12} /></button>)}</div></section>}
            <section className="x2l-detail-section"><h3>提到此地点的任务 <small>{relatedLoading || relatedError ? "" : related.length}</small></h3>
              {relatedLoading ? <p>正在读取任务资料…</p> : relatedError ? <p role="status">任务资料暂不可用，可稍后返回查看。</p> : related.length ? <><p className="x2l-muted-note">任务流程中的地点关联，包含途中与目标地点。</p><div className="x2l-related">{related.map((quest) => <button key={quest.id} onClick={() => onOpenQuest(quest.id)}><span><strong>{quest.name}</strong><small>{quest.type} · {quest.chapter}</small></span><UiIcon name="chevron-right" size={14} /></button>)}</div></> : <p className="x2l-muted-note">当前任务资料中没有此地点的明确名称记录。</p>}
            </section>
            <details className="x2l-source"><summary>版本与资料来源</summary><p>《异度神剑2》简体中文。按本篇与黄金国分别记录，扩展票地点归入本篇；剧情场景也纳入目录。</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看此地点的游戏数据<UiIcon name="link" size={12} /></a><a href={selectedRegion.sourceUrl} target="_blank" rel="noreferrer">查看地区数据<UiIcon name="link" size={12} /></a><p>目录包含具名地点；已排除测试场景、空白占位与重复的剧情记录。宝箱、采集点等交互物不计作地点。</p></details>
          </> : <div className="x2l-empty"><UiIcon name="file" size={30} /><h3>地点档案</h3><p>从清单选择一处地点，查看归属、奖励与相关任务。</p></div>}
        </dialog>}
      </div>
    </div>
  </div>;
}
