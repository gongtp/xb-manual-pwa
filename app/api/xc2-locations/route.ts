import { listXC2LocationProgress, saveXC2LocationProgress } from "../../../db/xc2-locations";
import { xc2Directory } from "../../../lib/xc2-location";

const locationIds = new Set(xc2Directory.locations.map((location) => location.id));

export async function GET() {
  try {
    return Response.json({ progress: await listXC2LocationProgress() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "探索记录读取失败，请重试。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let payload;
  try { payload = await request.json(); } catch {
    return Response.json({ error: "请求内容必须是有效的 JSON。" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.id !== "string" || !locationIds.has(payload.id)
    || (payload.visited === undefined && payload.bookmarked === undefined)
    || (payload.visited !== undefined && typeof payload.visited !== "boolean")
    || (payload.bookmarked !== undefined && typeof payload.bookmarked !== "boolean")) {
    return Response.json({ error: "地点编号或探索状态无效。" }, { status: 400 });
  }
  try {
    return Response.json({ progress: await saveXC2LocationProgress(payload.id, payload) });
  } catch {
    return Response.json({ error: "探索记录保存失败，请重试。" }, { status: 500 });
  }
}
