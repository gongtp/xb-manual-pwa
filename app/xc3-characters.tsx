"use client";

import { useEffect, useRef, useState } from "react";
import type { Quest } from "../lib/quest";
import { xc3Characters, xc3ArcNames, xc3KindNames, xc3CharacterSources, type XC3Character } from "../lib/xc3-character";
import "./xc3-characters.css";

type Props = { quests: Quest[]; relatedLoading: boolean; relatedError: string; onOpenQuest: (id: string) => void };
const roles = ["攻击者", "防卫者", "治疗者"] as const;

export default function XC3CharacterDirectory({ quests, relatedLoading, relatedError, onOpenQuest }: Props) {
  const [arc, setArc] = useState<XC3Character["arc"]>("baseGame");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<XC3Character | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chapterCharacters = xc3Characters.filter((character) => character.arc === arc);
  const search = query.trim().toLocaleLowerCase();
  const results = chapterCharacters.filter((character) => (kind === "all" || character.kind === kind)
    && (role === "all" || character.role === role)
    && (!search || [character.name, character.englishName, character.className, ...character.questNames].some((value) => value.toLocaleLowerCase().includes(search))));
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = results.slice((currentPage - 1) * 10, currentPage * 10);

  useEffect(() => {
    if (!selected || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = dialog.closest<HTMLElement>(".main-shell");
    const oldBodyOverflow = document.body.style.overflow;
    const oldShellOverflow = shell?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (shell) shell.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = oldBodyOverflow;
      if (shell) shell.style.overflow = oldShellOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [selected]);

  function resetFilters() { setQuery(""); setKind("all"); setRole("all"); setPage(1); }
  function turnPage(next: number) { setPage(next); listRef.current?.scrollIntoView({ block: "start" }); }

  return <section className="x3c-directory">
    <header className="x3c-topbar"><span>异度神剑 3 / 角色与英雄</span><label className="x3c-search"><span className="sr-only">搜索角色</span><input type="search" placeholder="搜索姓名、职业或相关任务" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></header>
    <div className="x3c-content">
      <div className="x3c-heading"><div><h1>角色与英雄</h1><p>队伍成员、战斗职责与加入方式</p></div><span className="x3c-total">{xc3Characters.length}<small>份角色档案</small></span></div>
      <div className="x3c-arcs" role="group" aria-label="选择篇章">{(Object.keys(xc3ArcNames) as XC3Character["arc"][]).map((value) => <button type="button" key={value} aria-pressed={arc === value} onClick={() => { setArc(value); resetFilters(); }}><strong>{xc3ArcNames[value]}</strong><span>{xc3Characters.filter((character) => character.arc === value).length} 份档案</span></button>)}</div>
      <div className="x3c-stats" aria-label="当前篇章统计"><div><strong>{chapterCharacters.filter((character) => character.kind === "party").length}</strong><span>队伍角色</span></div><div><strong>{chapterCharacters.filter((character) => character.kind === "hero").length}</strong><span>英雄</span></div>{roles.map((value) => <div key={value}><strong>{chapterCharacters.filter((character) => character.role === value).length}</strong><span>{value}</span></div>)}</div>
      <p className="x3c-note">{arc === "baseGame" ? "扩展票英雄归入本篇；职责按初始职业统计，里克与玛娜娜合为一份档案。" : "本篇章角色使用固定职业，奈尔作为英雄随队。"}</p>
      <div className="x3c-toolbar" ref={listRef}><p aria-live="polite">共 {results.length} 份档案</p><div><select aria-label="角色类型" value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><option value="all">全部角色</option><option value="party">队伍角色</option><option value="hero">英雄</option></select><select aria-label="战斗职责" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}><option value="all">全部职责</option>{roles.map((value) => <option key={value}>{value}</option>)}</select>{(query || kind !== "all" || role !== "all") && <button type="button" onClick={resetFilters}>重置</button>}</div></div>
      <div className="x3c-list">{visible.map((character) => <button className="x3c-row" type="button" key={character.id} onClick={() => setSelected(character)} aria-label={`查看${character.name}详情`}><span className="x3c-name"><strong>{character.name}</strong></span><span className="x3c-class">{character.className}</span><span className="x3c-role" data-role={character.role}>{character.role}</span><span className="x3c-kind">{xc3KindNames[character.kind]}{character.expansion && arc === "baseGame" && <small>扩展票</small>}</span><span className="x3c-arrow" aria-hidden="true">›</span></button>)}{!results.length && <div className="x3c-empty"><h2>没有找到匹配的角色</h2><p>试试其他姓名、职业，或清除筛选条件。</p><button type="button" onClick={resetFilters}>清除筛选</button></div>}</div>
      <nav className="x3c-pagination" aria-label="角色列表分页"><button type="button" disabled={currentPage === 1} onClick={() => turnPage(currentPage - 1)}>上一页</button><span aria-live="polite">第 {currentPage} / {pages} 页</span><button type="button" disabled={currentPage === pages} onClick={() => turnPage(currentPage + 1)}>下一页</button></nav>
    </div>
    <dialog className="x3c-dialog" ref={dialogRef} aria-labelledby="x3c-detail-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)}>{selected && <><header><div><p>{xc3ArcNames[selected.arc]} · {xc3KindNames[selected.kind]}</p><h2 id="x3c-detail-title">{selected.name}</h2><span>{selected.englishName}</span></div><button type="button" aria-label="关闭角色详情" onClick={() => setSelected(null)}>关闭</button></header><div className="x3c-detail-body"><dl><div><dt>{selected.kind === "party" && selected.arc === "baseGame" ? "初始职业" : "职业"}</dt><dd>{selected.className}</dd></div><div><dt>战斗职责</dt><dd>{selected.role}</dd></div></dl><h3>加入方式</h3><p>{selected.acquisition}</p>{selected.id === "baseGame-triton" && <p>主角使用灵魂骇客时可通过技能调整职责；此处按特莱登自身职责归类。</p>}<h3>相关任务</h3>{selected.questNames.length ? relatedLoading ? <p role="status">正在加载任务…</p> : relatedError ? <p role="alert">任务暂时无法读取，请返回任务页重试。</p> : <div className="x3c-quest-links">{selected.questNames.map((name) => {
      const quest = quests.find((item) => item.game === "XC3" && item.name === name);
      return quest ? <button key={name} type="button" onClick={() => { setSelected(null); onOpenQuest(quest.id); }}>{name}<span>查看任务 →</span></button> : <p key={name}>{name} · 当前任务库尚未收录</p>;
    })}</div> : <p>通过剧情或特殊条件加入，暂无关联任务条目。</p>}<details className="x3c-sources"><summary>资料来源</summary>{xc3CharacterSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>)}</details></div></>}</dialog>
  </section>;
}
