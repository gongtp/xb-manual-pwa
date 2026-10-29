export type PublishedVersion = { version: string; builtAt: string };

export async function fetchPublishedVersion(baseUrl: string): Promise<PublishedVersion> {
  const url = new URL("version.json", baseUrl);
  url.searchParams.set("check", String(Date.now()));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("无法获取服务器版本，请检查网络或稍后重试");
  const result = await response.json() as PublishedVersion;
  if (!/^[a-f0-9]{16}$/.test(result.version) || !Number.isFinite(Date.parse(result.builtAt))) {
    throw new Error("服务器版本信息不完整，请等待部署完成后重试");
  }
  return result;
}

export function waitForInstalled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", inspect);
      if (error) reject(error); else resolve();
    };
    const inspect = () => {
      if (worker.state === "installed" || worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("新版本下载失败，当前版本仍可使用，请重试"));
    };
    const timer = setTimeout(() => finish(new Error("下载仍未完成，请保持联网后重新检查")), 120_000);
    worker.addEventListener("statechange", inspect);
    inspect();
  });
}

export function workerVersion(worker: ServiceWorker): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("无法确认已下载版本，请稍后重试"));
    }, 5_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(String(event.data?.version ?? ""));
    };
    worker.postMessage({ type: "VERSION" }, [channel.port2]);
  });
}
