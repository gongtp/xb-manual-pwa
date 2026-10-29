"use client";
import { dataFetch, assetUrl } from "../lib/data-client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Quest } from "../lib/quest";
import { xc2Characters, type XC2Character, type XC2CharacterProgress } from "../lib/xc2-character";
import { UiIcon } from "./ui-icons";
import "./xc2-characters.css";

type Props = { quests: Quest[]; onOpenQuest: (id: string) => void };
type KindFilter = "all" | "driver" | "blade";
type CollectionFilter = "all" | "collected" | "missing" | "bookmarked";

const arcNames = { baseGame: "本篇", expansionPass: "扩展票", torna: "黄金之国伊拉" };
const acquisitionNames = { story: "剧情加入", resonance: "核心共鸣", quest: "任务获得", special: "特殊获得", newGamePlus: "二周目", challenge: "挑战模式", torna: "伊拉篇" };
const elementColors: Record<string, string> = { 火: "#bb6251", 水: "#5089a5", 风: "#4c8b78", 冰: "#75a4b0", 雷: "#9b864d", 地: "#917451", 土: "#917451", 光: "#b5a26d", 暗: "#8a799d" };

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function Star({ filled = false }: { filled?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9Z" /></svg>;
}

function ElementMark({ element, fallback = "属性可变" }: { element: string; fallback?: string }) {
  return <span className="xc2-element-mark" style={{ "--element-color": elementColors[element] ?? "#698579" } as CSSProperties}>
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m12 6 5 6-5 6-5-6Z" fill="currentColor" opacity=".8" /></svg>
    {element || fallback}
  </span>;
}

function CharacterImage({ character, eager = false }: { character: XC2Character; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!character.image || failed) return <span className="xc2-art-fallback" aria-label={`${character.name}暂无角色图片`}><span>{character.name.slice(0, 1)}</span><small>角色档案</small></span>;
  // Source-credited local artwork uses its natural aspect ratio in both the gallery and character stage.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="xc2-character-art" src={assetUrl(character.image)} alt={character.name} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
}

function BattleSkillList({ skills }: { skills: XC2Character["battleSkills"] }) {
  return <div className="xc2-battle-skills">{skills.map((skill) => <div key={skill.name}><h4>{skill.name}</h4><p>{skill.effect}</p></div>)}</div>;
}

function DriverAffinityChart({ skills }: { skills: XC2Character["battleSkills"] }) {
  const [chart, setChart] = useState<"表象牵绊" | "内心牵绊">("表象牵绊");
  return <div className="xc2-affinity">
    <div className="xc2-affinity-tabs" role="group" aria-label="选择牵绊圆环">
      {(["表象牵绊", "内心牵绊"] as const).map((name) => <button type="button" key={name} aria-pressed={chart === name} onClick={() => setChart(name)}>{name}</button>)}
    </div>
    <p className="xc2-affinity-guide">每环按游戏中的位置从左到右排列，编号 1—5。</p>
    {[1, 2, 3].map((ring) => <details className="xc2-affinity-ring" key={`${chart}-${ring}`} open={ring === 1}>
      <summary><strong>第 {ring} 环</strong><span>5 个位置 · 从左到右</span><UiIcon name="chevron-down" size={16} /></summary>
      <ol>{skills.filter((skill) => skill.affinity?.chart === chart && skill.affinity.ring === ring)
        .sort((left, right) => left.affinity!.position - right.affinity!.position)
        .map((skill) => <li key={skill.name}>
          <span className="xc2-affinity-position">第 {ring} 环 · 从左第 {skill.affinity!.position} 个</span>
          <h4>{skill.name}</h4><p>{skill.effect}</p>
        </li>)}</ol>
    </details>)}
  </div>;
}

function archiveTag(character: XC2Character) {
  if (character.isForm) return "形态档案";
  if (!character.collectible && character.playable) return "临时可操作";
  if (!character.collectible) return "资料档案";
  return "";
}

function characterLabel(character: XC2Character) {
  if (character.kind === "blade") return "异刃";
  return character.collectible ? "御刃者" : "角色";
}

export default function XC2CharacterDirectory({ quests, onOpenQuest }: Props) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [arcFilter, setArcFilter] = useState("all");
  const [elementFilter, setElementFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [acquisitionFilter, setAcquisitionFilter] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState(xc2Characters[0]?.id ?? "");
  const [progressById, setProgressById] = useState<Record<string, XC2CharacterProgress>>({});
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");
  const [reload, setReload] = useState(0);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const detailRef = useRef<HTMLDialogElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
    dataFetch("/api/xc2-characters", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "无法读取图鉴进度");
        if (!Array.isArray(body.progress)) throw new Error("图鉴进度格式异常");
        return body.progress as XC2CharacterProgress[];
      })
      .then((progress) => {
        setProgressById(Object.fromEntries(progress.map((entry) => [entry.id, entry])));
        setProgressError("");
        setProgressLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProgressError(error instanceof Error ? error.message : "无法读取图鉴进度");
        setProgressLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const characterById = useMemo(() => new Map(xc2Characters.map((character) => [character.id, character])), []);
  const questById = useMemo(() => new Map(quests.map((quest) => [quest.id, quest])), [quests]);
  const elements = useMemo(() => uniqueValues(xc2Characters.map((character) => character.element)), []);
  const roles = useMemo(() => uniqueValues(xc2Characters.map((character) => character.role)), []);
  const availableAcquisitions = useMemo(() => uniqueValues(xc2Characters.map((character) => character.acquisitionType)), []);

  const filteredCharacters = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return xc2Characters.filter((character) => {
      const progress = progressById[character.id];
      if (kindFilter !== "all" && character.kind !== kindFilter) return false;
      if (arcFilter !== "all" && character.arc !== arcFilter) return false;
      if (elementFilter !== "all" && character.element !== elementFilter) return false;
      if (roleFilter !== "all" && character.role !== roleFilter) return false;
      if (acquisitionFilter !== "all" && character.acquisitionType !== acquisitionFilter) return false;
      if (collectionFilter === "collected" && (!character.collectible || !progress?.collected)) return false;
      if (collectionFilter === "missing" && (!character.collectible || progress?.collected)) return false;
      if (collectionFilter === "bookmarked" && !progress?.bookmarked) return false;
      const haystack = [character.name, character.englishName, character.group, character.element, character.role, character.weapon, character.acquisition, ...character.fieldSkills, ...character.battleSkills.map((skill) => skill.name), ...character.favoriteCategories, ...character.favoriteItems].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [query, kindFilter, arcFilter, elementFilter, roleFilter, acquisitionFilter, collectionFilter, progressById]);

  const selected = characterById.get(selectedId);
  const selectedProgress = selected ? progressById[selected.id] : undefined;
  const relatedQuests = selected ? selected.questIds.map((id) => questById.get(id)).filter((quest): quest is Quest => Boolean(quest)) : [];
  const partners = selected ? selected.partners.map((id) => characterById.get(id)).filter((character): character is XC2Character => Boolean(character)) : [];
  const collectedCount = xc2Characters.filter((character) => character.collectible && progressById[character.id]?.collected).length;
  const collectibleCount = xc2Characters.filter((character) => character.collectible).length;
  const hasFilters = Boolean(query || kindFilter !== "all" || arcFilter !== "all" || elementFilter !== "all" || roleFilter !== "all" || acquisitionFilter !== "all" || collectionFilter !== "all");
  const advancedFilterCount = [arcFilter, elementFilter, roleFilter, acquisitionFilter].filter((value) => value !== "all").length;
  const auxiliaryCoreLabel = !selected ? "" : selected.auxCores !== null ? `${selected.auxCores} 个槽位`
    : ["花JS", "花JK", "花JD"].includes(selected.name) ? "使用花的定制部件"
    : selected.isForm ? "无独立辅助核心槽位" : "暂未收录";
  const hasAffinityChart = selected?.kind === "driver" && selected.battleSkills.some((skill) => skill.affinity);

  function resetFilters() {
    setQuery("");
    setKindFilter("all");
    setArcFilter("all");
    setElementFilter("all");
    setRoleFilter("all");
    setAcquisitionFilter("all");
    setCollectionFilter("all");
  }

  function selectCharacter(id: string, fromPartner = false) {
    if (fromPartner && detailRef.current) {
      detailRef.current.scrollTop = 0;
      detailRef.current.querySelector<HTMLButtonElement>(".xc2-dialog-header button")?.focus({ preventScroll: true });
    }
    setSelectedId(id);
    setSaveError("");
    setSaveMessage("");
    setDetailOpen(true);
  }

  async function updateProgress(character: XC2Character, field: "collected" | "bookmarked") {
    if (savingIds[character.id] || progressLoading || progressError) return;
    const value = !progressById[character.id]?.[field];
    setSavingIds((current) => ({ ...current, [character.id]: true }));
    setSaveError("");
    setSaveMessage("");
    try {
      const response = await dataFetch("/api/xc2-characters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: character.id, [field]: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败，请重试");
      if (!body.progress || body.progress.id !== character.id) throw new Error("保存结果格式异常，请重新加载进度");
      setProgressById((current) => ({ ...current, [character.id]: body.progress }));
      setSaveMessage(`${character.name}的${field === "collected" ? "获得状态" : "收藏状态"}已保存`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSavingIds((current) => ({ ...current, [character.id]: false }));
    }
  }

  return <div className="xc2-codex">
    <header className="xc2-topbar">
      <div className="xc2-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>异度神剑 2</strong></div>
      <label className="xc2-search"><UiIcon name="search" size={18} /><input aria-label="搜索角色与异刃" placeholder="搜索名称、武器、场景技能…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空角色搜索" onClick={() => setQuery("")}><UiIcon name="close" size={16} /></button>}</label>
    </header>

    <main className="xc2-content">
      <div className="xc2-heading">
        <div><p className="xc2-kicker"><span /> ALREST ARCHIVE</p><h1>角色与异刃<span>在云海之上，遇见同行之人。</span></h1></div>
        <div className="xc2-collection-summary"><span>我的图鉴</span><strong>{progressLoading || progressError ? "—" : collectedCount}<small> / {collectibleCount}</small></strong><span>已获得</span></div>
      </div>

      <div className="xc2-directory-tools">
        <div className="xc2-kind-tabs" role="group" aria-label="角色类型">
          {(["all", "driver", "blade"] as const).map((kind) => <button key={kind} type="button" aria-pressed={kindFilter === kind} className={kindFilter === kind ? "active" : ""} onClick={() => setKindFilter(kind)}>{kind === "all" ? "全部档案" : kind === "driver" ? "御刃者与角色" : "异刃"}<span>{kind === "all" ? xc2Characters.length : xc2Characters.filter((character) => character.kind === kind).length}</span></button>)}
        </div>
        <button type="button" className="xc2-filter-toggle" aria-expanded={showFilters} aria-controls="xc2-directory-filters" onClick={() => setShowFilters((value) => !value)}><UiIcon name="list" size={16} />筛选{advancedFilterCount > 0 && <span>{advancedFilterCount}</span>}<UiIcon name="chevron-down" size={14} /></button>
        <label className="xc2-collection-filter"><Star /><select aria-label="图鉴收集状态" value={collectionFilter} disabled={progressLoading || Boolean(progressError)} onChange={(event) => setCollectionFilter(event.target.value as CollectionFilter)}><option value="all">全部收集状态</option><option value="collected">已获得</option><option value="missing">尚未获得</option><option value="bookmarked">我的收藏</option></select></label>
      </div>

      <div className={`xc2-filterbar${showFilters ? " is-open" : ""}`} id="xc2-directory-filters">
        <label><span>篇章</span><select aria-label="角色篇章" value={arcFilter} onChange={(event) => setArcFilter(event.target.value)}><option value="all">全部篇章</option>{Object.entries(arcNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label><span>属性</span><select aria-label="异刃属性" value={elementFilter} onChange={(event) => setElementFilter(event.target.value)}><option value="all">全部属性</option>{elements.map((element) => <option key={element}>{element}</option>)}</select></label>
        <label><span>职责</span><select aria-label="角色职责" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">全部职责</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label><span>获得方式</span><select aria-label="角色获得方式" value={acquisitionFilter} onChange={(event) => setAcquisitionFilter(event.target.value)}><option value="all">全部方式</option>{availableAcquisitions.map((type) => <option key={type} value={type}>{acquisitionNames[type as keyof typeof acquisitionNames]}</option>)}</select></label>
        <button type="button" className="xc2-reset" disabled={!hasFilters} onClick={resetFilters}><UiIcon name="refresh" size={15} />重置</button>
      </div>

      {progressLoading && <p className="xc2-progress-loading" role="status">正在读取图鉴进度…</p>}
      {progressError && <div className="xc2-error" role="alert"><UiIcon name="alert" />图鉴进度加载失败：{progressError}<button type="button" onClick={() => { setProgressLoading(true); setReload((value) => value + 1); }}>重新加载</button></div>}

      <div className="xc2-workspace">
        <section className="xc2-gallery-panel" aria-label="角色图鉴目录">
          <div className="xc2-panel-title"><h2>人物图鉴</h2><span>{filteredCharacters.length} 个档案{hasFilters && ` / ${xc2Characters.length}`}</span></div>
          {filteredCharacters.length ? <div className="xc2-character-grid">{filteredCharacters.map((character, index) => {
            const progress = progressById[character.id];
            const tag = archiveTag(character);
            return <button type="button" key={character.id} className={`xc2-character-card${selected?.id === character.id ? " selected" : ""}`} aria-haspopup="dialog" aria-label={`查看${character.name}档案`} onClick={() => selectCharacter(character.id)} style={{ "--element-color": elementColors[character.element] ?? "#65837b" } as CSSProperties}>
              <span className="xc2-card-art"><span className="xc2-card-number">{String(index + 1).padStart(2, "0")}</span><CharacterImage character={character} />{progress?.bookmarked && <span className="xc2-card-bookmark" aria-label="已收藏"><Star filled /></span>}{tag && <span className="xc2-card-tag">{tag}</span>}</span>
              <span className="xc2-card-info"><span className="xc2-card-name"><strong>{character.name}</strong>{progress?.collected && character.collectible && <span className="xc2-card-collected" title="已获得" aria-label="已获得"><UiIcon name="check" size={16} /></span>}</span><small>{character.englishName}</small><span className="xc2-card-meta">{character.element ? <ElementMark element={character.element} /> : <span>{arcNames[character.arc]}</span>}<span>{character.role || characterLabel(character)}</span></span></span>
            </button>;
          })}</div> : <div className="xc2-empty"><UiIcon name="search" size={30} /><strong>没有找到符合条件的档案</strong><p>试试其他名称、属性或场景技能。</p><button type="button" onClick={resetFilters}>清除筛选</button></div>}
          <div className="xc2-gallery-footer"><span><i />简体中文名称</span><span>形态与临时角色不计入收集进度</span></div>
        </section>

        {detailOpen && selected && <dialog className="xc2-detail xc2-character-dialog" ref={detailRef} aria-label={`${selected.name}角色档案`} onCancel={() => setDetailOpen(false)} onClose={() => setDetailOpen(false)}>
          <header className="xc2-dialog-header"><strong>角色档案</strong><button type="button" aria-label="关闭角色详情" onClick={() => setDetailOpen(false)}><UiIcon name="close" size={20} /></button></header>
          <div className="xc2-detail-hero" style={{ "--element-color": elementColors[selected.element] ?? "#65837b" } as CSSProperties}>
            <div className="xc2-hero-lines" aria-hidden="true" />
            <div className="xc2-detail-identity"><p className="xc2-file-label">{selected.kind === "driver" ? selected.collectible ? "DRIVER" : "CHARACTER" : "BLADE"}<span>{arcNames[selected.arc]}</span></p><h2>{selected.name}</h2><p className="xc2-english-name">{selected.englishName}</p><div className="xc2-hero-tags">{selected.element && <ElementMark element={selected.element} />}{selected.role && <span>{selected.role}</span>}</div><p className="xc2-hero-group">{selected.group}</p></div>
            <div className="xc2-detail-art"><CharacterImage key={selected.id} character={selected} eager /></div>
            <span className="xc2-hero-index">{characterLabel(selected)}档案</span>
          </div>
          <div className="xc2-detail-actions">
            {selected.collectible ? <button type="button" className={`xc2-collect-button${selectedProgress?.collected ? " obtained" : ""}`} aria-label={`${selectedProgress?.collected ? "取消" : "标记"}${selected.name}已获得`} aria-pressed={Boolean(selectedProgress?.collected)} disabled={progressLoading || Boolean(progressError) || savingIds[selected.id]} onClick={() => updateProgress(selected, "collected")}><UiIcon name={selectedProgress?.collected ? "check" : "plus"} size={17} />{savingIds[selected.id] ? "保存中…" : selectedProgress?.collected ? "已获得" : "标记已获得"}</button> : <span className="xc2-uncollectible"><UiIcon name="info" size={16} />{archiveTag(selected)} · 不计入收集</span>}
            <button type="button" className={`xc2-bookmark-button${selectedProgress?.bookmarked ? " bookmarked" : ""}`} aria-label={`${selectedProgress?.bookmarked ? "取消收藏" : "收藏"}${selected.name}`} aria-pressed={Boolean(selectedProgress?.bookmarked)} disabled={progressLoading || Boolean(progressError) || savingIds[selected.id]} onClick={() => updateProgress(selected, "bookmarked")}><Star filled={selectedProgress?.bookmarked} />{selectedProgress?.bookmarked ? "已收藏" : "收藏"}</button>
          </div>
          <div className="xc2-save-feedback" aria-live="polite">{saveError ? <p className="xc2-save-error">{saveError}</p> : saveMessage ? <p>{saveMessage}</p> : null}</div>
          <div className="xc2-detail-body">
            {selected.spoiler && <div className="xc2-spoiler-note"><UiIcon name="info" size={16} /><span>包含后期角色信息，加入方式默认折叠。</span></div>}
            <p className="xc2-character-description">{selected.description}</p>
            <dl className="xc2-facts"><div><dt>武器</dt><dd>{selected.weapon || "暂未收录"}</dd></div><div><dt>{selected.kind === "driver" ? "身份" : "能力修正"}</dt><dd>{selected.kind === "driver" ? selected.group || characterLabel(selected) : selected.statModifier || "暂未收录"}</dd></div>{selected.kind === "blade" && <div><dt>辅助核心</dt><dd>{auxiliaryCoreLabel}</dd></div>}</dl>

            <details className="xc2-acquisition" key={selected.id} open={!selected.spoiler}><summary><span><UiIcon name="shield-check" size={18} />加入与获得</span><b>{acquisitionNames[selected.acquisitionType]}</b><UiIcon name="chevron-down" size={16} /></summary><p>{selected.acquisition}</p></details>

            {partners.length > 0 && <section className="xc2-detail-section"><div className="xc2-section-heading"><h3>同行伙伴</h3><span>{selected.kind === "driver" ? "关联异刃与角色" : "关联御刃者与形态"}</span></div><div className="xc2-partners">{partners.map((partner) => <button key={partner.id} type="button" onClick={() => selectCharacter(partner.id, true)} aria-label={`查看伙伴${partner.name}档案`}><span className="xc2-partner-art"><CharacterImage character={partner} /></span><span><strong>{partner.name}</strong><small>{partner.isForm ? "关联形态" : characterLabel(partner)}</small></span><UiIcon name="chevron-right" size={15} /></button>)}</div></section>}

            <section className="xc2-detail-section"><div className="xc2-section-heading"><h3>场景技能</h3><span>探索与环境互动</span></div>{selected.fieldSkills.length ? <div className="xc2-field-skills">{selected.fieldSkills.map((skill) => <span key={skill}><i />{skill}</span>)}</div> : <p className="xc2-unavailable">{selected.kind === "driver" ? "场景技能由同行异刃提供。" : "场景技能资料暂未收录。"}</p>}</section>

            {selected.battleSkills.length > 0 && <section className="xc2-detail-section"><div className="xc2-section-heading"><h3>{hasAffinityChart ? "牵绊圆环" : "战斗技能"}</h3><span>{selected.battleSkills.length} 项能力</span></div>{hasAffinityChart ? <DriverAffinityChart key={selected.id} skills={selected.battleSkills} /> : <BattleSkillList skills={selected.battleSkills} />}</section>}

            <section className="xc2-detail-section"><div className="xc2-section-heading"><h3>收纳包喜好</h3><UiIcon name="gift" size={17} /></div><dl className="xc2-favorites"><div><dt>喜好类别</dt><dd>{selected.favoriteCategories.length ? selected.favoriteCategories.join(" · ") : "暂未收录"}</dd></div><div><dt>最喜欢的物品</dt><dd>{selected.favoriteItems.length ? selected.favoriteItems.map((item) => <span key={item}>{item}</span>) : "暂未收录"}</dd></div></dl></section>

            <section className="xc2-detail-section"><div className="xc2-section-heading"><h3>关联任务</h3><span>{relatedQuests.length} 项</span></div>{relatedQuests.length ? <div className="xc2-related-quests">{relatedQuests.map((quest) => <button type="button" key={quest.id} onClick={() => onOpenQuest(quest.id)}><span><strong>{quest.name}</strong><small>{[quest.region, quest.type].filter(Boolean).join(" · ")}</small></span><UiIcon name="chevron-right" size={17} /></button>)}</div> : <p className="xc2-unavailable">{selected.questIds.length ? "关联任务暂未载入。" : "暂未关联任务档案。"}</p>}</section>
          </div>
          <footer className="xc2-detail-source"><div><span>资料来源</span>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看角色资料<UiIcon name="link" size={14} /></a> : <span>资料暂未提供</span>}</div>{selected.imageSource && <a href={selected.imageSource} target="_blank" rel="noreferrer">角色图片来源<UiIcon name="link" size={13} /></a>}<p>Switch 原版本篇 / 扩展票 / 黄金之国伊拉</p><p>收录有名字的御刃者与史诗、稀有异刃；普通随机异刃不逐个列出。</p><p>更新于 {selected.updatedAt}</p></footer>
        </dialog>}
      </div>
    </main>
  </div>;
}
