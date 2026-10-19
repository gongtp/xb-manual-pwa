import { build } from "vite";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({ configFile: path.join(root, "vite.pwa.config.ts") });
const output = path.join(root, "dist-pwa");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const files = (await walk(output)).sort();
const hash = createHash("sha256");
for (const file of files) { hash.update(path.relative(output, file)); hash.update(await readFile(file)); }
const template = await readFile(path.join(root, "pwa/sw-template.js"), "utf8");
hash.update(template);
const version = hash.digest("hex").slice(0, 16);
const paths = files.map((file) => path.relative(output, file).replaceAll("\\", "/")).filter((file) => file !== ".nojekyll");
await writeFile(path.join(output, "sw.js"), template.replace("const VERSION = __VERSION__", `const VERSION = ${JSON.stringify(version)}`).replace("const FILES = __FILES__", `const FILES = ${JSON.stringify(paths)}`));
console.log(`PWA ${version}: ${paths.length} files prepared for offline use. Output: dist-pwa`);
