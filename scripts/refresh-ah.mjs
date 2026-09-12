import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEastmoneyAhPairs } from "../src/adapters/eastmoney.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "public", "data", "ah-pairs.json");
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
const data = { generatedAt: new Date().toISOString(), pairs: await fetchEastmoneyAhPairs() };
if (Object.keys(data.pairs).length < 150) throw new Error(`AH mapping coverage too low: ${Object.keys(data.pairs).length}`);
await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`);
await fs.rename(temporaryPath, outputPath);
console.log(`Updated ${Object.keys(data.pairs).length} AH mappings.`);
