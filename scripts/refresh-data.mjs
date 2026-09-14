import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEastmoney52wRange, fetchEastmoneyShortSelling, fetchEastmoneyUniverseQuotes, fetchSouthboundFlow } from "../src/adapters/eastmoney.mjs";
import { backfillEnhancements, buildContinuity, buildSnapshot, rankableUniverse, sameMarketSnapshot } from "../src/lib/pipeline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public", "data");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

function dateInHongKong(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveTradeDate(quotes) {
  const timestamps = quotes.map((quote) => quote.timestamp).filter(Number.isFinite);
  if (!timestamps.length) throw new Error("quotes do not contain a valid market timestamp");
  return dateInHongKong(Math.max(...timestamps));
}

function marketStatus(tradeDate, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return tradeDate === date && time < "16:15" ? "intraday" : "close";
}

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporaryPath, filePath);
}

async function loadPreviousSnapshots(tradeDate, max = 5) {
  const dailyDir = path.join(outputDir, "daily");
  let files = [];
  try {
    files = await fs.readdir(dailyDir);
  } catch {
    return [];
  }
  const previous = files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file) && file.slice(0, 10) < tradeDate)
    .sort()
    .slice(-max)
    .reverse();
  const snapshots = [];
  for (const file of previous) {
    try {
      snapshots.push(JSON.parse(await fs.readFile(path.join(dailyDir, file), "utf8")));
    } catch (error) {
      console.warn(`Skipping unreadable daily snapshot ${file}: ${error.message}`);
    }
  }
  return snapshots;
}

const [universe, profiles, ahData] = await Promise.all([
  readJson("data/universe.json"),
  readJson("data/company-profiles.json"),
  readJson("public/data/ah-pairs.json"),
]);

const pool = rankableUniverse(universe);
const quotes = await fetchEastmoneyUniverseQuotes(pool.map((item) => item.code));
const generatedAt = new Date().toISOString();
const tradeDate = resolveTradeDate(quotes);
const [shortSelling, southbound, week52] = await Promise.all([
  fetchEastmoneyShortSelling({ tradeDate }).catch((error) => {
    console.warn(`Short selling skipped: ${error.message}`);
    return {};
  }),
  fetchSouthboundFlow().catch((error) => {
    console.warn(`Southbound flow skipped: ${error.message}`);
    return null;
  }),
  fetchEastmoney52wRange(pool.map((item) => item.code)).catch((error) => {
    console.warn(`52w range skipped: ${error.message}`);
    return {};
  }),
]);
const previousSnapshots = await loadPreviousSnapshots(tradeDate);
const fallbackArchive = previousSnapshots.find((snap) => (snap.securities ?? []).some((item) => item.shortRatio != null))
  ?? previousSnapshots[0]
  ?? null;
const snapshot = backfillEnhancements(buildSnapshot({
  quotes,
  universe: pool,
  profiles,
  ahPairs: ahData.pairs,
  history: buildContinuity(previousSnapshots),
  shortSelling,
  southbound,
  week52,
  generatedAt,
  tradeDate,
  marketStatus: marketStatus(tradeDate),
  limit: 50,
  minimumCoverage: 0.8,
}), fallbackArchive);

let currentSnapshot = null;
try {
  currentSnapshot = await readJson("public/data/latest.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (sameMarketSnapshot(currentSnapshot, snapshot)) {
  const currentByCode = new Map((currentSnapshot?.securities ?? []).map((item) => [item.code, item]));
  const missingShorts = snapshot.securities.some((item) => {
    const prev = currentByCode.get(item.code);
    return item.shortRatio != null && prev && prev.shortRatio == null;
  });
  const missingSouthbound = snapshot.market?.southboundNetBuy != null
    && currentSnapshot?.market?.southboundNetBuy == null;
  const missingWeek52 = snapshot.securities.some((item) => {
    const prev = currentByCode.get(item.code);
    return item.high52 != null && prev && prev.high52 == null;
  });
  if (!missingShorts && !missingSouthbound && !missingWeek52) {
    console.log(`No newer market data for ${tradeDate}; keeping the existing snapshot.`);
    process.exit(0);
  }
  console.log(`Market data unchanged for ${tradeDate}; backfilling ${
    [missingShorts && "short selling", missingSouthbound && "southbound flow", missingWeek52 && "52w range"].filter(Boolean).join(" and ")
  }.`);
}
const fetchedRanges = Object.keys(week52).length;
console.log(`52w range coverage: ${fetchedRanges}/${pool.length} securities.`);

await fs.mkdir(path.join(outputDir, "daily"), { recursive: true });
await atomicWrite(path.join(outputDir, "daily", `${tradeDate}.json`), snapshot);
await atomicWrite(path.join(outputDir, "latest.json"), snapshot);
console.log(`Generated ${tradeDate}: ${snapshot.coverage.matched}/${snapshot.coverage.universe} securities matched.`);
