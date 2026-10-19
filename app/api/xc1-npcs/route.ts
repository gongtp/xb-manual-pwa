import { listXc1Npcs } from "../../../db/xc1-npcs";

export async function GET() {
  try {
    return Response.json({ npcs: await listXc1Npcs() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "NPC 数据库读取失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
