import { listXC2CharacterProgress, saveXC2CharacterProgress } from "../../../db/xc2-characters";
import { xc2Characters } from "../../../lib/xc2-character";

const charactersById = new Map(xc2Characters.map((character) => [character.id, character]));

export async function GET() {
  try {
    return Response.json({ progress: await listXC2CharacterProgress() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "收集记录读取失败，请重试。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let payload;
  try { payload = await request.json(); } catch {
    return Response.json({ error: "请求内容必须是有效的 JSON。" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.id !== "string"
    || !charactersById.has(payload.id)
    || (payload.collected === undefined && payload.bookmarked === undefined)
    || (payload.collected !== undefined && typeof payload.collected !== "boolean")
    || (payload.bookmarked !== undefined && typeof payload.bookmarked !== "boolean")) {
    return Response.json({ error: "角色编号或收集状态无效。" }, { status: 400 });
  }
  if (payload.collected !== undefined && !charactersById.get(payload.id)?.collectible) {
    return Response.json({ error: "该档案无法独立获得，可以使用收藏记录。" }, { status: 400 });
  }
  try {
    return Response.json({ progress: await saveXC2CharacterProgress(payload.id, payload) });
  } catch {
    return Response.json({ error: "收集记录保存失败，请重试。" }, { status: 500 });
  }
}
