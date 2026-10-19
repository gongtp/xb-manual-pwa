import { execFileSync } from "node:child_process";

const ref = process.argv[2] || "HEAD";
if (!/^(HEAD|[a-f0-9]{40})$/.test(ref)) throw new Error("Invalid revision");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const roots = git("rev-list", "--max-parents=0", ref).trim().split(/\s+/);
if (roots.length !== 1 || roots[0] !== "76561f75a26962cedf34768773ca20a9d9a0255e") {
  throw new Error("拒绝推送：历史不是 GitHub 干净历史，可能包含原个人数据库。");
}
const blocked = [];
for (const line of git("rev-list", "--objects", ref).trim().split("\n")) {
  const space = line.indexOf(" ");
  if (space < 0) continue;
  const hash = line.slice(0, space);
  const name = line.slice(space + 1);
  if (/^(work|outputs|backups?|personal-data)(\/|$)|\.(sqlite\d*|db\d*)(-|$)|\.bundle$|(^|\/)\.env|(?:backup|备份).*\.json$/i.test(name)) {
    blocked.push(name);
    continue;
  }
  if (name.endsWith(".json")) {
    const value = JSON.parse(git("cat-file", "blob", hash));
    if (value?.format === "xeno-archive-backup") blocked.push(name);
  }
}
if (blocked.length) throw new Error(`拒绝推送：发现个人数据或备份路径：\n${[...new Set(blocked)].join("\n")}`);
console.log("公开历史检查通过：未发现数据库文件、完整备份或旧仓库历史。");
