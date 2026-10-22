import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL, fileURLToPath } from "node:url";

const repository = "gongtp/xb-manual-pwa";
const base = `/repos/${repository}/deployments`;
export const deletable = (state) => ["inactive", "failure", "error"].includes(state);

export async function listDeployments(api) {
  const records = [];
  for (let page = 1; ; page++) {
    const batch = await api(`${base}?environment=github-pages&per_page=100&page=${page}`);
    for (const deployment of batch) {
      if (deployment.environment !== "github-pages") continue;
      const statuses = await api(`${base}/${deployment.id}/statuses?per_page=1`);
      records.push({ ...deployment, state: statuses[0]?.state ?? "unknown" });
    }
    if (batch.length < 100) return records;
  }
}

export async function deleteOldDeployment(api, id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("无效记录 ID");
  const path = `${base}/${id}`;
  const deployment = await api(path);
  if (deployment.environment !== "github-pages") throw new Error("拒绝删除其他环境的记录");
  let statuses = await api(`${path}/statuses?per_page=1`);
  if (!deletable(statuses[0]?.state)) throw new Error("该记录当前为 Active、正在部署或状态未知，已保护");
  if (statuses[0].state !== "inactive") {
    await api(`${path}/statuses`, "POST", { state: "inactive", auto_inactive: false, description: "用户确认清理失败的历史部署记录" });
  }
  // Re-read immediately before deleting; never deactivate successful/live deployments.
  statuses = await api(`${path}/statuses?per_page=1`);
  if (statuses[0]?.state !== "inactive") throw new Error("部署状态已变化，取消删除");
  await api(path, "DELETE");
}

function credential() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  console.log("正在使用已有 Git 登录凭据；如弹出 GitHub 登录窗口，请完成登录。");
  const result = spawnSync("git", ["credential", "fill"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    input: "protocol=https\nhost=github.com\npath=gongtp/xb-manual-pwa.git\n\n",
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000,
  });
  const token = result.stdout?.match(/^password=(.+)$/m)?.[1]?.trim();
  if (result.status !== 0 || !token) throw new Error("无法获取已有 Git 登录凭据。请完成 GitHub 登录后重试；无需把令牌发给任何人。");
  return token;
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let token;
  async function api(path, method = "GET", body) {
    token ??= credential();
    const response = await fetch(`https://api.github.com${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new Error(`GitHub 拒绝授权（${response.status}）。账号需有仓库管理权限，令牌需 Deployments 读写权限；也可能达到 API 限额。`);
      throw new Error(`GitHub 请求失败（${response.status}）；操作已停止，请刷新列表核对。`);
    }
    return response.status === 204 ? null : response.json();
  }
  function show(records) {
    console.table(records.map((d, i) => ({ 序号: i + 1, ID: d.id, 状态: d.state === "success" ? "Active（保护）" : d.state,
      可删除: deletable(d.state) ? "是" : "否", 时间: new Date(d.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      提交: d.sha.slice(0, 7), 说明: d.description || d.ref })));
  }
  console.log(`部署记录管理：${repository} / github-pages\n只管理部署记录，不提交代码、不推送、不发布，不删除 Actions 运行记录。`);
  try {
    while (true) {
      const choice = (await rl.question("\n1 查询部署记录\n2 选择并删除旧部署记录\n0 退出\n请输入：")).trim();
      if (choice === "0") break;
      if (!["1", "2"].includes(choice)) { console.log("请输入 1、2 或 0。"); continue; }
      try {
        const records = await listDeployments(api);
        show(records);
        if (!records.length) { console.log("没有部署记录。"); continue; }
        if (choice === "1") continue;
        const input = (await rl.question("输入要删除的序号（多个用逗号分隔），all 选择全部可删除记录，0 取消：")).trim();
        if (input === "0") continue;
        let selected;
        if (input === "all") selected = records.filter((d) => deletable(d.state));
        else {
          if (!/^\d+(?:\s*[,，]\s*\d+)*$/.test(input)) throw new Error("序号格式无效");
          selected = [...new Set(input.split(/[,，]/).map(Number))].map((n) => records[n - 1]);
          if (selected.some((d) => !d || !deletable(d.state))) throw new Error("选中了无效序号或受保护记录，未删除任何记录");
        }
        if (!selected.length) { console.log("没有可删除的旧记录。"); continue; }
        console.log("即将永久删除以下部署记录：");
        show(selected);
        if ((await rl.question(`输入 DELETE 确认删除 ${selected.length} 条记录，其他输入取消：`)).trim() !== "DELETE") continue;
        for (const d of selected) {
          await deleteOldDeployment(api, d.id);
          console.log(`已删除 ${d.id}`);
        }
        console.log("清理完成。Active 部署已保留。");
      } catch (error) { console.error(error.message); }
    }
  } finally { rl.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("脚本已退出，未完成的操作请重新查询后确认。"); process.exitCode = 1; });
}
