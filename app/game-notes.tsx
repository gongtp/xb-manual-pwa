"use client";
import { dataFetch } from "../lib/data-client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  emptyGameNote,
  gameNoteCategories,
  type GameNote,
} from "../lib/game-note";
import { gameNames, type GameCode } from "../lib/quest";
import { UiIcon } from "./ui-icons";
import "./game-notes.css";

type GameNotesProps = {
  game: GameCode;
  onToast: (message: string) => void;
};

type NotesPayload = {
  error?: string;
  note?: GameNote;
  notes?: GameNote[];
};

async function requestNotes(game: GameCode, method = "GET", body?: unknown) {
  const response = await dataFetch(method === "GET" ? `/api/notes?game=${game}` : "/api/notes", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as NotesPayload;
  if (!response.ok) throw new Error(payload.error || "笔记数据库操作失败");
  return payload;
}

function parseInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const parts = text.split(pattern);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return <a href={link[2]} key={index} target="_blank" rel="noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

function cleanTableCell(cell: string) {
  return cell
    .trim()
    .replace(/\]{2,}/g, "")
    .replace(/(?:^|\s)(?:无|缩略图)\\?(?=\s|$)/g, " ")
    .replace(/\b\d+px\b/gi, "")
    .replace(/\\+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(cleanTableCell);
}

function normalizeTableRow(line: string, columnCount: number) {
  const cells = splitTableRow(line);
  if (cells.length > columnCount && columnCount > 0) {
    return [
      ...cells.slice(0, columnCount - 1),
      cells.slice(columnCount - 1).filter(Boolean).join(" "),
    ];
  }
  return [...cells, ...Array(Math.max(0, columnCount - cells.length)).fill("")];
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? "";
  const next = lines[index + 1] ?? "";
  return /^#{1,6}\s+/.test(line)
    || /^```/.test(line)
    || /^>\s?/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line)
    || /^\s*(---+|___+|\*\*\*+)\s*$/.test(line)
    || (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(next));
}

export function MarkdownPreview({ content, compact = false }: { content: string; compact?: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code data-language={language}>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = parseInline(heading[2]);
      if (level === 1) blocks.push(<h1 key={`heading-${index}`}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={`heading-${index}`}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={`heading-${index}`}>{children}</h3>);
      else blocks.push(<h4 key={`heading-${index}`}>{children}</h4>);
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }

    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(normalizeTableRow(lines[index], headers.length));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{parseInline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{parseInline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{parseInline(quote.join(" "))}</blockquote>);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: Array<{ text: string; checked?: boolean }> = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*+]\s+/, "");
        const task = item.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(task ? { text: task[2], checked: task[1].toLowerCase() === "x" } : { text: item });
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => (
        <li className={item.checked === undefined ? "" : "markdown-task"} key={itemIndex}>
          {item.checked !== undefined && <input type="checkbox" checked={item.checked} readOnly />}
          <span>{parseInline(item.text)}</span>
        </li>
      ))}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const start = Number(line.match(/^\s*(\d+)\./)?.[1] ?? 1);
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol start={start} key={`ordered-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{parseInline(item)}</li>)}</ol>);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{parseInline(paragraph.join(" "))}</p>);
  }

  return <article className={`markdown-content${compact ? " markdown-content-compact" : ""}`}>{blocks.length ? blocks : <p className="markdown-empty">还没有正文内容。</p>}</article>;
}

function noteExcerpt(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function noteReadingContent(note: GameNote) {
  return note.content.replace(/^\s*#\s+([^\r\n]+)(?:\r?\n|$)/, (heading, title: string) => (
    title.trim() === note.title.trim() ? "" : heading
  ));
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function GameNotes({ game, onToast }: GameNotesProps) {
  const [notes, setNotes] = useState<GameNote[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<GameNote | null>(null);
  const [editorView, setEditorView] = useState<"write" | "preview">("write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestNotes(game)
      .then((payload) => {
        if (cancelled) return;
        const records = payload.notes ?? [];
        setNotes(records);
        setSelectedId(records[0]?.id ?? "");
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [game]);

  const categories = useMemo(
    () => [...new Set([...gameNoteCategories, ...notes.map((note) => note.category)])],
    [notes],
  );
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes.filter((note) => (
      (category === "all" || note.category === category)
      && (!needle || `${note.title} ${note.category} ${note.content}`.toLowerCase().includes(needle))
    ));
  }, [category, notes, query]);
  const selectedNote = visibleNotes.find((note) => note.id === selectedId) ?? visibleNotes[0];

  function openNewNote() {
    setEditing({ ...emptyGameNote(game), content: "# 新笔记\n\n在这里记录重点、玩法或待办事项。" });
    setEditorView("write");
  }

  function openEditor(note: GameNote) {
    setEditing({ ...note });
    setEditorView("write");
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing?.title.trim()) return;
    setSaving(true);
    try {
      const payload = await requestNotes(game, "POST", { note: { ...editing, game } });
      const records = payload.notes ?? [];
      setNotes(records);
      setSelectedId(payload.note?.id ?? records[0]?.id ?? "");
      setEditing(null);
      onToast("玩法笔记已保存");
    } catch (saveError) {
      onToast(saveError instanceof Error ? saveError.message : "保存笔记失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(note: GameNote) {
    if (!window.confirm(`确定删除笔记“${note.title}”吗？此操作无法撤销。`)) return;
    setSaving(true);
    try {
      const payload = await requestNotes(game, "DELETE", { id: note.id, game });
      const records = payload.notes ?? [];
      setNotes(records);
      setSelectedId(records[0]?.id ?? "");
      setEditing(null);
      onToast("玩法笔记已删除");
    } catch (deleteError) {
      onToast(deleteError instanceof Error ? deleteError.message : "删除笔记失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notes-page">
      <header className="topbar notes-topbar">
        <div className="workspace-breadcrumb"><span>资料库</span><UiIcon name="chevron-right" size={14} /><strong>{gameNames[game]}</strong></div>
        <label className="search-box">
          <span><UiIcon name="search" size={18} /></span>
          <input data-archive-search aria-label="搜索笔记" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记标题或内容" />
        </label>
        <div className="top-actions">
          <button className="primary-button" onClick={openNewNote} disabled={loading || saving}><UiIcon name="plus" size={17} />新建笔记</button>
        </div>
      </header>

      <div className="content notes-content">
        <section className="notes-heading">
          <div><h1>玩法笔记</h1><p>把战斗技巧、探索路线和游戏心得，整理成自己的攻略。</p></div>
        </section>

        {error && <div className="database-error"><strong>笔记数据库连接失败</strong><span>{error}</span></div>}

        <div className="notes-workspace">
          <aside className="notes-list-panel">
            <div className="notes-list-title"><div><UiIcon name="notebook" size={17} /><strong>笔记目录</strong><span>{visibleNotes.length}</span></div><button onClick={openNewNote} aria-label="新建笔记" disabled={loading || saving}><UiIcon name="plus" size={17} /></button></div>
            <div className="notes-list-filter">
              <label htmlFor="notes-category-filter">分类</label>
              <select id="notes-category-filter" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">全部分类</option>
                {categories.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </div>
            <div className="notes-list">
              {loading && <div className="notes-empty"><span>◌</span><p>正在读取笔记…</p></div>}
              {!loading && visibleNotes.map((note, index) => (
                <button className={`note-row ${selectedNote?.id === note.id ? "selected" : ""}`} aria-current={selectedNote?.id === note.id ? "true" : undefined} key={note.id} onClick={() => { setSelectedId(note.id); setEditing(null); }}>
                  <span className="note-row-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="note-row-copy">
                    <span className="note-row-meta"><em>{note.category}</em>{note.isPinned && <b title="置顶">置顶</b>}</span>
                    <strong>{note.title}</strong>
                    <span className="note-row-excerpt">{noteExcerpt(note.content) || "暂无正文"}</span>
                    <small>{formatUpdatedAt(note.updatedAt).split(" ")[0]}</small>
                  </span>
                </button>
              ))}
              {!loading && !visibleNotes.length && <div className="notes-empty"><span><UiIcon name="search" size={28} /></span><strong>没有匹配的笔记</strong><p>可以新建一篇 Markdown 笔记。</p></div>}
            </div>
          </aside>

          <section className="note-detail-panel">
            {editing ? (
              <form className="note-editor" onSubmit={saveNote}>
                <div className="note-editor-heading">
                  <div><span className="note-editor-label"><UiIcon name="edit" size={15} />正在编辑</span><h2>{editing.id ? "编辑玩法笔记" : "新建玩法笔记"}</h2></div>
                  <div className="editor-view-tabs" role="group" aria-label="编辑器视图">
                    <button type="button" className={editorView === "write" ? "active" : ""} onClick={() => setEditorView("write")}>编辑</button>
                    <button type="button" className={editorView === "preview" ? "active" : ""} onClick={() => setEditorView("preview")}>预览</button>
                  </div>
                </div>

                <div className="note-fields">
                  <label className="note-title-field">标题<input required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="例如：连锁攻击使用技巧" /></label>
                  <label>分类<select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                    {categories.map((item) => <option value={item} key={item}>{item}</option>)}
                  </select></label>
                  <label>排序<input type="number" value={editing.sortOrder} onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) || 0 })} /></label>
                  <label className="pin-field"><input type="checkbox" checked={editing.isPinned} onChange={(event) => setEditing({ ...editing, isPinned: event.target.checked })} />置顶显示</label>
                </div>

                {editorView === "write" ? (
                  <div className="markdown-editor-field">
                    <div className="markdown-help"><span>Markdown 正文</span><small>支持标题、列表、待办框、粗体、链接、表格和代码块</small></div>
                    <textarea value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} rows={24} spellCheck={false} placeholder="# 标题&#10;&#10;- 记录内容" />
                  </div>
                ) : <div className="markdown-preview"><MarkdownPreview content={editing.content} /></div>}

                <div className="note-editor-actions">
                  <button className="secondary-button" type="button" onClick={() => setEditing(null)}>取消</button>
                  <button className="primary-button" type="submit" disabled={saving}>{saving ? "正在保存…" : "保存笔记"}</button>
                </div>
              </form>
            ) : selectedNote ? (
              <div className="note-viewer">
                <div className="note-viewer-heading">
                  <div className="note-viewer-title"><div className="note-viewer-meta"><span className="note-category">{selectedNote.category}</span>{selectedNote.isPinned && <span className="pinned-label">已置顶</span>}<span>更新于 {formatUpdatedAt(selectedNote.updatedAt)}</span></div><h2>{selectedNote.title}</h2></div>
                  <div className="note-actions">
                    <button className="secondary-button" onClick={() => openEditor(selectedNote)}><UiIcon name="edit" size={16} />编辑</button>
                    <button className="danger-button" onClick={() => removeNote(selectedNote)} disabled={saving}>删除</button>
                  </div>
                </div>
                <MarkdownPreview content={noteReadingContent(selectedNote)} />
              </div>
            ) : (
              <div className="note-detail-empty"><span><UiIcon name="notebook" size={36} /></span><h2>还没有玩法笔记</h2><p>用 Markdown 记录这部游戏的重要玩法和注意事项。</p><button className="primary-button" onClick={openNewNote}>新建第一篇笔记</button></div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
