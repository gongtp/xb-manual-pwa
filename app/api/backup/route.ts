import { exportBackup, ensureAllTables } from "../../../db/backup";
import { getSqlite } from "../../../db";
import { validateBackup } from "../../../lib/backup";

export async function GET() {
  try { return Response.json(await exportBackup(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: String(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 50 * 1024 * 1024) throw new Error("备份超过 50 MB 限制");
    const backup = validateBackup(JSON.parse(body));
    await ensureAllTables();
    // The synchronous transaction either restores every table or changes none.
    getSqlite().restoreBackup(backup);
    return Response.json({ restored: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "备份导入失败" }, { status: 400 });
  }
}
