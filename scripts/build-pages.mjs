import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");

// 站点所需文件的唯一清单。Workers 与 Pages 两条发布路径都只发 dist/，
// 因此"某条 ignore 规则只对其中一个目标生效"不再能决定发布面。
const files = [
  "index.html",
  "404.html",
  "app.js",
  "styles.css",
  "_headers",
  "data/universe.json",
  "data/company-profiles.json",
  "public/data/ah-pairs.json",
  "public/data/latest.json",
  "public/images/latest.png",
];
const directories = ["src"];

// 刻意不发布：public/data/daily/** 与 public/images/daily/**。
// 它们只被服务端刷新脚本读取（Git 检出里就有），页面从不请求。
// 历史上它们随站发布，占部署体积 67%，且每交易日 +2.8MB 永久增长。

async function copyFile(relative) {
  const from = path.join(root, relative);
  try {
    await fs.access(from);
  } catch {
    throw new Error(`build:pages 缺少 ${relative}。先执行 npm run daily 生成快照与图片，再发布。`);
  }
  const to = path.join(outDir, relative);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function walk(dir, collected = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, collected);
    else collected.push(full);
  }
  return collected;
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
for (const relative of files) await copyFile(relative);
for (const directory of directories) {
  await fs.cp(path.join(root, directory), path.join(outDir, directory), { recursive: true });
}

const built = await walk(outDir);
let total = 0;
for (const file of built) total += (await fs.stat(file)).size;
console.log(`build:pages -> dist/ (${built.length} files, ${(total / 1048576).toFixed(2)} MB)`);
