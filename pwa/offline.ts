export function registerOfflineWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: "none" })
    .catch((error) => window.dispatchEvent(new CustomEvent("offline-error", { detail: `离线缓存未完成：${String(error)}` })));
}
