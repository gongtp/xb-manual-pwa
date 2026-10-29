import * as quests from "../app/api/quests/route";
import * as labels from "../app/api/quest-labels/route";
import * as notes from "../app/api/notes/route";
import * as npcs from "../app/api/xc1-npcs/route";
import * as locations1 from "../app/api/xc1-locations/route";
import * as locations2 from "../app/api/xc2-locations/route";
import * as locations3 from "../app/api/xc3-locations/route";
import * as characters from "../app/api/xc2-characters/route";
import * as backup from "../app/api/backup/route";
import { withLocalDatabase } from "./database";

const routes: Record<string, Record<string, (request: Request) => Promise<Response>>> = {
  "/api/xc3-locations": locations3,
  "/api/quests": quests, "/api/quest-labels": labels, "/api/notes": notes,
  "/api/xc1-npcs": npcs, "/api/xc1-locations": locations1,
  "/api/xc2-locations": locations2, "/api/xc2-characters": characters, "/api/backup": backup,
};
export const isOfflineApp = true;
export const assetUrl = (url: string) => url.startsWith("/") ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url;
export const dataFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), location.origin), init);
  request.signal.throwIfAborted();
  const handler = routes[new URL(request.url).pathname]?.[request.method];
  if (!handler) return Response.json({ error: "离线应用不支持此操作" }, { status: 404 });
  try {
    return await withLocalDatabase(async () => {
      request.signal.throwIfAborted();
      return handler(request);
    }, !(new URL(request.url).pathname === "/api/backup" && request.method === "GET"));
  } catch (error) {
    if (request.signal.aborted) throw error;
    return Response.json({ error: error instanceof Error ? error.message : "本机数据库操作失败" }, { status: 500 });
  }
};
