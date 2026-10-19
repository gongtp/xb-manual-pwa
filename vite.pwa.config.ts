import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { makeIcon } from "./build/pwa-icon";

const root = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.PWA_BASE_PATH || "/";
if (!/^\/(?:[A-Za-z0-9_.-]+\/)*$/.test(base)) throw new Error("PWA_BASE_PATH 必须是 / 或 /仓库名/ 格式的路径");

function localDatabase(): Plugin {
  return {
    name: "pwa-local-database",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(importer.split("?")[0]), source);
      if (["db", "db/index", "db/index.ts"].some((name) => resolved === path.join(root, name))) return normalizePath(path.join(root, "pwa/database.ts"));
      if (["lib/data-client", "lib/data-client.ts"].some((name) => resolved === path.join(root, name))) return normalizePath(path.join(root, "pwa/data-client.ts"));
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sql-wasm.wasm", source: readFileSync(path.join(root, "node_modules/sql.js/dist/sql-wasm.wasm")) });
      for (const size of [192, 512]) this.emitFile({ type: "asset", fileName: `icons/icon-${size}.png`, source: makeIcon(size) });
      this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify({
        id: base, name: "异度资料库", short_name: "异度资料库", lang: "zh-CN",
        start_url: base, scope: base, display: "standalone", background_color: "#fafbf8", theme_color: "#173c36",
        icons: [192, 512].map((size) => ({ src: `${base}icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" })),
      }) });
    },
  };
}

export default defineConfig({
  root: path.join(root, "pwa"), base,
  publicDir: path.join(root, "public"),
  plugins: [localDatabase(), react()],
  build: { outDir: path.join(root, "dist-pwa"), emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
