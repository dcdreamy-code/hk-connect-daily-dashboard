import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildShareImageSvg } from "../src/lib/share-image.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "public", "data", "latest.json");
const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
const svg = buildShareImageSvg(snapshot);
const LOGICAL_WIDTH = 1242;
const LOGICAL_HEIGHT = 3660;
const scale = Number(process.env.SHARE_IMAGE_SCALE ?? 2);
const { data, info } = await sharp(Buffer.from(svg), { density: 72 * scale })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer({ resolveWithObject: true });

if (info.width !== LOGICAL_WIDTH * scale || info.height !== LOGICAL_HEIGHT * scale) {
  throw new Error("unexpected share image dimensions: " + info.width + "x" + info.height);
}

const imageRoot = path.join(root, "public", "images");
const dailyDir = path.join(imageRoot, "daily");
await fs.mkdir(dailyDir, { recursive: true });

async function atomicWrite(filePath) {
  const temporaryPath = filePath + "." + process.pid + ".tmp";
  await fs.writeFile(temporaryPath, data);
  await fs.rename(temporaryPath, filePath);
}

const dailyPath = path.join(dailyDir, snapshot.tradeDate + ".png");
const latestPath = path.join(imageRoot, "latest.png");
await atomicWrite(dailyPath);
await atomicWrite(latestPath);
console.log("Generated " + latestPath + " (" + info.width + "x" + info.height + " @" + scale + "x, " + info.size + " bytes).");
