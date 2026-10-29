"use client";
import { useEffect, useId, useRef, useState } from "react";
import { dataFetch, isOfflineApp } from "../lib/data-client";
import { validateBackup, type ArchiveBackup } from "../lib/backup";
import { fetchPublishedVersion, waitForInstalled, workerVersion, type PublishedVersion } from "../lib/pwa-update";
import "./data-tools.css";
import { UiIcon } from "./ui-icons";

export default function DataTools({ compact = false }: { compact?: boolean }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ArchiveBackup | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [offline, setOffline] = useState(isOfflineApp ? "正在准备离线资源…" : "电脑 SQLite 数据库");
  const [updateReady, setUpdateReady] = useState(false);
  const [currentVersion] = useState(() => typeof document === "undefined" ? "" : document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content ?? "");
  const [latestVersion, setLatestVersion] = useState<PublishedVersion | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
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
    setBusy(true); setChecking(true); setUpdateMessage("正在连接服务器检查最新版本…");
    try {
      if (!("serviceWorker" in navigator)) throw new Error("当前浏览器不支持离线更新");
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("离线功能尚未启用，请确认使用已发布的 HTTPS 网站");
      const latest = await fetchPublishedVersion(registration.scope);
      setLatestVersion(latest);
      setCheckedAt(new Date().toLocaleString("zh-CN"));
      if (latest.version === currentVersion) {
        setUpdateReady(false);
        setUpdateMessage("已是服务器最新版本，无需更新。");
        return;
      }
      setUpdateMessage("发现新版本，正在获取完整离线资源…");
      await registration.update();
      if (registration.installing) await waitForInstalled(registration.installing);
      const downloaded = registration.waiting ?? registration.active;
      if (!downloaded || await workerVersion(downloaded) !== latest.version) {
        throw new Error("服务器文件可能仍在部署中，尚未取得完整最新版本，请稍后重试");
      }
      setUpdateReady(true);
      setUpdateMessage("最新版本已下载。保存编辑内容后，点击“更新并重启”即可使用。");
    } catch (error) {
      setUpdateReady(false);
      setUpdateMessage(`检查或下载未完成：${error instanceof Error ? error.message : String(error)}。当前已保存数据不受影响。`);
    }
    finally { setBusy(false); setChecking(false); }
  }

  async function applyUpdate() {
    if (!confirm("请先保存正在编辑的内容。应用更新将重新打开资料库，已保存的个人数据会保留。是否继续？")) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("离线功能尚未启用");
      const target = registration.waiting ?? registration.active;
      if (!target) throw new Error("未找到已下载版本，请重新检查更新");
      if (latestVersion && await workerVersion(target) !== latestVersion.version) throw new Error("已下载版本发生变化，请重新检查更新");
      if (!registration.waiting) { location.reload(); return; }
      setUpdateMessage("正在切换版本，即将重新打开资料库…");
      await new Promise<void>((resolve, reject) => {
        const changed = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener("controllerchange", changed);
          reject(new Error("切换版本超时，请关闭应用后重新打开"));
        }, 15_000);
        navigator.serviceWorker.addEventListener("controllerchange", changed, { once: true });
        target.postMessage({ type: "SKIP_WAITING" });
      });
      location.reload();
    } catch (error) { setUpdateMessage(String(error)); setBusy(false); }
  }

  return <>
    <button className="data-tools-trigger" onClick={() => setOpen(true)}>{compact || isOfflineApp ? "备份与更新" : "完整备份与恢复"}</button>
    <dialog className="data-tools-dialog" ref={panel} onCancel={(e) => { if (busy) e.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)} aria-labelledby={titleId}>
      <header className="data-tools-header"><div><h2 id={titleId}>{isOfflineApp ? "备份与更新" : "备份与恢复"}</h2><p>管理应用版本与本地资料</p></div><button className="data-tools-close" disabled={busy} onClick={() => setOpen(false)} aria-label="关闭备份与更新"><UiIcon name="close" size={20} /></button></header>
      <div className="data-tools-body">
      {isOfflineApp && <section className="app-update-panel">
        <div className="data-tools-section-title"><UiIcon name="refresh" size={19} /><h3>应用更新</h3>{updateReady && <span className="data-tools-badge">新版本已就绪</span>}</div>
        <div className="data-tools-versions"><div><span>当前版本</span><strong>{currentVersion || "版本信息未记录"}</strong></div><div><span>服务器版本</span><strong>{latestVersion?.version || "等待检查"}</strong></div></div>
        {latestVersion && <p className="data-tools-meta">发布于 {new Date(latestVersion.builtAt).toLocaleString("zh-CN")}</p>}
        <div className="data-tools-actions"><button className={updateReady ? "" : "data-tools-primary"} disabled={busy} onClick={checkUpdate}><UiIcon name="refresh" size={16} />{checking ? "正在检查与下载…" : "检查最新版本"}</button>
        {updateReady && <button className="data-tools-primary" disabled={busy} onClick={applyUpdate}>更新并重启<UiIcon name="chevron-right" size={16} /></button>}</div>
        <p className="data-tools-status" role="status">{updateMessage || (updateReady ? "更新已下载，保存编辑后即可重启。" : "主动检查服务器，发现新版本后自动下载。")}</p>
        {checkedAt && <p className="data-tools-meta">上次检查 {checkedAt}</p>}
        <p className="data-tools-hint">更新保留已保存的笔记与进度，请先保存正在编辑的内容。</p>
      </section>}
      <section className="data-tools-backup"><div className="data-tools-section-title"><UiIcon name="database" size={19} /><h3>资料备份</h3><span className="data-tools-tag">全部作品</span></div>
      <p>导出任务、标签、玩法笔记和收集进度，在其他设备继续使用。</p>
      <div className="data-tools-actions">
        <button disabled={busy} onClick={exportAll}><UiIcon name="download" size={16} />导出完整备份</button>
        <button disabled={busy} onClick={() => fileInput.current?.click()}><UiIcon name="upload" size={16} />导入备份</button>
        <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      <p className="data-tools-hint">{isOfflineApp ? "资料仅存于当前设备。换设备或清理应用前请备份，个人数据不会自动跨设备同步。" : "备份电脑端全部业务数据，可导入手机离线版；基础图片不重复打包。"}</p>
      {download && <a className="backup-download" href={download.url} download={download.name}>保存备份：{download.name}</a>}
      {pending && <section className="backup-confirm">
        <h3>确认恢复完整备份</h3>
        <p>备份时间：{pending.exportedAt}。包含 {pending.tables.quests.length} 条任务、{pending.tables.game_notes.length} 篇笔记、{pending.tables.quest_labels.length} 个标签。</p>
        <p><strong>导入会覆盖当前设备的全部业务数据，不会合并。请先导出当前备份，并保存正在编辑的内容。</strong></p>
        <button disabled={busy} onClick={restore}>确认覆盖并恢复</button>
        <button disabled={busy} onClick={() => setPending(null)}>取消导入</button>
      </section>}
      </section>
      {isOfflineApp && <section className="data-tools-offline"><UiIcon name="shield-check" size={19} /><div><h3>离线资源</h3><p role="status">{offline}</p>
        <p className="data-tools-hint">首次使用请等待资源下载完成，外部链接仍需联网。</p></div>
      </section>}
      {(busy || message) && <p className="data-tools-status" role="status">{busy ? "正在处理，请勿关闭页面…" : message}</p>}
      </div>
      <footer className="data-tools-footer"><span><UiIcon name="shield-check" size={14} />本地数据由你保管</span><button disabled={busy} onClick={() => setOpen(false)}>完成</button></footer>
    </dialog>
  </>;
}
