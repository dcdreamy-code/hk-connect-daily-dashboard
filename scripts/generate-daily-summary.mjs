import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDailySummary } from "../src/lib/daily-summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(await fs.readFile(path.join(root, "public", "data", "latest.json"), "utf8"));
const summary = buildDailySummary(snapshot);

console.log(summary);
const outDir = path.join(root, "outputs", "summary");
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `${snapshot.tradeDate}.txt`);
await fs.writeFile(outFile, `${summary}\n`, "utf8");
console.error(`\nSaved to ${outFile}`);
