import { deleteGameNote, listGameNotes, saveGameNote } from "../../../db/game-notes";
import { isGameCode } from "../../../lib/quest";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "笔记数据库操作失败";
  return Response.json({ error: message }, { status: message.includes("无效") || message.includes("缺少") ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("game");
    if (value && !isGameCode(value)) {
      return Response.json({ error: "游戏编号无效" }, { status: 400 });
    }
    const game = value && isGameCode(value) ? value : undefined;
    return Response.json({ notes: await listGameNotes(game) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { note?: unknown };
    const note = await saveGameNote(payload.note);
    return Response.json({ note, notes: await listGameNotes(note.game) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { id?: unknown; game?: unknown };
    const id = String(payload.id ?? "");
    const game = payload.game;
    if (!isGameCode(game)) return Response.json({ error: "游戏编号无效" }, { status: 400 });
    await deleteGameNote(id);
    return Response.json({ notes: await listGameNotes(game) });
  } catch (error) {
    return errorResponse(error);
  }
}
