import {
  importQuests,
  listQuests,
  normalizeQuest,
  resetQuests,
  saveQuest,
  setQuestMarker,
} from "../../../db/quests";
import { listQuestLabels } from "../../../db/quest-labels";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "数据库操作失败";
  const status = message.includes("已经存在")
    ? 409
    : /互斥|标签|任务不存在|任务编号不能为空/.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json({ quests: await listQuests(), labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { quest?: unknown; originalId?: string | null; exclusivePeerId?: string | null };
    const quest = normalizeQuest(payload.quest);
    if (!quest) {
      return Response.json({ error: "任务编号、游戏、任务名称或资料状态无效" }, { status: 400 });
    }
    const savedQuest = await saveQuest(quest, payload.originalId, payload.exclusivePeerId);
    return Response.json({ quest: savedQuest, quests: await listQuests(), labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { quests?: unknown[] };
    if (!Array.isArray(payload.quests)) {
      return Response.json({ error: "导入内容必须是任务数组" }, { status: 400 });
    }
    const report = await importQuests(payload.quests);
    return Response.json({ ...report, quests: await listQuests(), labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { questId?: unknown; markerId?: unknown };
    const quest = await setQuestMarker(payload.questId, payload.markerId);
    return Response.json({ quest });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    return Response.json({ quests: await resetQuests(), labels: await listQuestLabels() });
  } catch (error) {
    return errorResponse(error);
  }
}
