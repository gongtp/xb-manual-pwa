import { createQuestLabel, deleteQuestLabel, listQuestLabels } from "../../../db/quest-labels";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "标签操作失败";
  const status = message.includes("已经存在") || message.includes("正在被") ? 409 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json({ labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { game?: unknown; name?: unknown };
    const label = await createQuestLabel(payload.game, payload.name);
    return Response.json({ label, labels: await listQuestLabels() }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { id?: unknown };
    const label = await deleteQuestLabel(payload.id);
    return Response.json({ label, labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}
