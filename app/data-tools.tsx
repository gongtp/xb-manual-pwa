"use client";
import { useEffect, useId, useRef, useState } from "react";
import { dataFetch, isOfflineApp } from "../lib/data-client";
import { validateBackup, type ArchiveBackup } from "../lib/backup";
import "./data-tools.css";

export default function DataTools({ compact = false }: { compact?: boolean }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ArchiveBackup | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [offline, setOffline] = useState(isOfflineApp ? "正在准备离线资源…" : "电脑 SQLite 数据库");
  const [updateReady, setUpdateReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDialogElement>(null);

  useEffect(() => { if (open) panel.current?.showModal(); else panel.current?.close(); }, [open]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  useEffect(() => {
    if (!isOfflineApp || !("serviceWorker" in navigator)) return;
    const error = (event: Event) => setOffline((event as CustomEvent<string>).detail);
    const message = (event: MessageEvent) => {
      if (event.data?.type === "CACHE_PROGRESS") setOffline(`离线资料下载中 ${event.data.done}/${event.data.total}`);
      if (event.data?.type === "CACHE_FAILED") setOffline("离线下载失败，请联网后检查更新重试");
      if (event.data?.type === "CACHE_READY") setOffline("离线资料已就绪，可断网使用");
    };
    const inspect = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      setUpdateReady(Boolean(registration.waiting));
      registration.active?.postMessage({ type: "STATUS" });
      const track = () => registration.installing?.addEventListener("statechange", () => {
        setUpdateReady(Boolean(registration.waiting));
        if (registration.active) registration.active.postMessage({ type: "STATUS" });
      });
      registration.addEventListener("updatefound", track);
      track();
    };
    window.addEventListener("offline-error", error);
    navigator.serviceWorker.addEventListener("message", message);
    void navigator.serviceWorker.ready.then(inspect);
    const timer = window.setInterval(() => {
      void navigator.serviceWorker.getRegistration().then((r) => {
        setUpdateReady(Boolean(r?.waiting));
        r?.active?.postMessage({ type: "STATUS" });
      });
    }, 15_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("offline-error", error);
      navigator.serviceWorker.removeEventListener("message", message);
    };
  }, []);

  async function exportAll() {
    setBusy(true); setMessage("");
    try {
      const response = await dataFetch("/api/backup");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const json = JSON.stringify(validateBackup(body), null, 2);
      const name = `异度资料库完整备份-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      setDownload({ url: URL.createObjectURL(new Blob([json], { type: "application/json" })), name });
      setMessage("备份已生成。点击保存备份，在 iPhone 中可保存到“文件”或 iCloud Drive。");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    setPending(null); setMessage(""); setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("文件超过 50 MB，请选择完整备份 JSON");
      setPending(validateBackup(JSON.parse(await file.text())));
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true); setMessage("");
    try {
      const response = await dataFetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      location.reload();
    } catch (error) { setMessage(String(error)); setBusy(false); }
  }

  async function checkUpdate() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("离线功能尚未启用，请确认使用已发布的 HTTPS 网站");
      await registration.update();
      setUpdateReady(Boolean(registration.waiting));
      setMessage(registration.installing ? "正在下载新版本，请稍候。" : registration.waiting ? "新版本已下载，保存编辑内容后可应用更新。" : "检查完成，尚无待应用的新版本。");
      const persisted = await navigator.storage?.persist?.();
      if (!persisted) setMessage((text) => `${text} 请定期导出备份。`);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function applyUpdate() {
    if (!confirm("请先保存正在编辑的内容。应用更新将重新打开资料库，已保存的个人数据会保留。是否继续？")) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  return <>
    <button className="data-tools-trigger" onClick={() => setOpen(true)}>{compact ? "备份与更新" : `完整备份与${isOfflineApp ? "离线管理" : "恢复"}`}</button>
    <dialog className="data-tools-dialog" ref={panel} onCancel={(e) => { if (busy) e.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)} aria-labelledby={titleId}>
      <h2 id={titleId}>完整备份与恢复</h2>
      <p>{isOfflineApp ? "数据仅保存在当前设备的 Web App 中。删除应用、清理存储或换设备前请备份。" : "备份当前电脑 SQLite 中的全部业务数据，可导入手机离线版。"}</p>
      <p>包含全部作品的任务、标签、笔记、NPC 关联、探索与角色收集进度。基础图片随应用提供，不重复放入备份。</p>
      <div className="data-tools-actions">
        <button disabled={busy} onClick={exportAll}>生成完整备份</button>
        <button disabled={busy} onClick={() => fileInput.current?.click()}>选择备份导入</button>
        <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {download && <a className="backup-download" href={download.url} download={download.name}>保存备份：{download.name}</a>}
      {pending && <section className="backup-confirm">
        <h3>确认恢复完整备份</h3>
        <p>备份时间：{pending.exportedAt}。包含 {pending.tables.quests.length} 条任务、{pending.tables.game_notes.length} 篇笔记、{pending.tables.quest_labels.length} 个标签。</p>
        <p><strong>导入会覆盖当前设备的全部业务数据，不会合并。请先导出当前备份，并保存正在编辑的内容。</strong></p>
        <button disabled={busy} onClick={restore}>确认覆盖并恢复</button>
        <button disabled={busy} onClick={() => setPending(null)}>取消导入</button>
      </section>}
      {isOfflineApp && <section><h3>离线与更新</h3><p role="status">{offline}</p>
        <p>首次添加到主屏幕后，请从桌面图标进入并等到“离线资料已就绪”。外部资料链接仍需联网。</p>
        <button disabled={busy} onClick={checkUpdate}>检查更新 / 重试下载</button>
        {updateReady && <button disabled={busy} onClick={applyUpdate}>应用已下载的新版本</button>}
      </section>}
      <p role="status">{busy ? "正在处理，请勿关闭页面…" : message}</p>
      <button disabled={busy} onClick={() => setOpen(false)}>关闭</button>
    </dialog>
  </>;
}
