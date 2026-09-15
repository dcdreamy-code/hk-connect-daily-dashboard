import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEastmoneyIndexes, fetchEastmoneyShortSelling, fetchEastmoneyStockNews, fetchEastmoneyUniverseQuotes, fetchSouthboundFlow } from "../src/adapters/eastmoney.mjs";
import { fetchTencent52wRange } from "../src/adapters/tencent.mjs";
import { hongKongDate } from "../src/lib/market-clock.mjs";
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

// 盘中区间必须与 src/lib/market-clock.mjs 一致：09:30–12:00 / 13:00–16:10。
// 这里原先是 16:15，会在 16:10–16:15 之间产出与实际不符的 intraday 快照。
const INTRADAY_CLOSE_HHMM = "16:10";

function marketStatus(tradeDate, now = new Date()) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return tradeDate === hongKongDate(now) && time < INTRADAY_CLOSE_HHMM ? "intraday" : "close";
}

// 归档默认全部保留（Git 历史本身有价值，且部署时已不再发布它们）。
// 若工作区体积需要控制，设 ARCHIVE_RETENTION_DAYS=60 只保留最近 N 个交易日。
async function pruneArchives(tradeDate, retentionDays) {
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) return [];
  const cutoff = new Date(`${tradeDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const targets = [
    [path.join(outputDir, "daily"), /^\d{4}-\d{2}-\d{2}\.json$/],
    [path.join(root, "public", "images", "daily"), /^\d{4}-\d{2}-\d{2}\.png$/],
  ];
  const removed = [];
  for (const [dir, pattern] of targets) {
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!pattern.test(file) || file.slice(0, 10) >= cutoffDate) continue;
      await fs.rm(path.join(dir, file), { force: true });
      removed.push(file);
    }
  }
  return removed;
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
  fetchTencent52wRange(pool.map((item) => item.code)).catch((error) => {
    console.warn(`52w range skipped: ${error.message}`);
    return {};
  }),
  fetchEastmoneyIndexes().catch((error) => {
    console.warn(`indexes skipped: ${error.message}`);
    return [];
  }),
]);
const previousSnapshots = await loadPreviousSnapshots(tradeDate);
const fallbackArchive = previousSnapshots.find((snap) => (snap.securities ?? []).some((item) => item.shortRatio != null))
  ?? previousSnapshots[0]
  ?? null;// 52w data must never regress: fill fresh-fetch misses from the newest archive that has it
const week52Archive = previousSnapshots.find((snap) => (snap.securities ?? []).some((item) => item.high52 != null));
const mergedWeek52 = { ...week52 };
if (week52Archive) {
  for (const item of week52Archive.securities ?? []) {
    if (item.high52 != null && mergedWeek52[item.code] == null) {
      mergedWeek52[item.code] = { high52: item.high52, low52: item.low52 };
    }
  }
}
function focusCodesFor(snapshot) {
  const turnover = snapshot.rankings?.turnover ?? [];
  const picks = [
    turnover[0],
    turnover.toSorted((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))[0],
    turnover.toSorted((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))[0],
    turnover.find((item) => Number.isFinite(item.high52) && Number.isFinite(item.high) && item.high >= item.high52),
    turnover.filter((item) => Number.isFinite(item.shortRatio) && item.shortRatio >= 20).toSorted((a, b) => b.shortRatio - a.shortRatio)[0],
  ].filter(Boolean);
  return [...new Map(picks.map((item) => [item.code, item])).keys()].slice(0, 6);
}

function searchKeywordFor(code, pool) {
  const raw = pool.find((item) => item.code === code)?.name ?? code;
  return raw.replace(/[-‑](?:W|S|SW|R)$/i, "").trim();
}

const snapshot = backfillEnhancements(buildSnapshot({
  quotes,
  universe: pool,
  profiles,
  ahPairs: ahData.pairs,
  history: buildContinuity(previousSnapshots),
  shortSelling,
  southbound,
  week52: mergedWeek52,
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
    && (currentSnapshot?.market?.southboundNetBuy == null
      || currentSnapshot?.market?.southboundAsOf != null);
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

// 南向净买入每日序列(近 20 个交易日,供页面走势图与播报引用)
const southboundSeries = [];
for (const snap of [...previousSnapshots].reverse()) {
  const net = snap.market?.southboundNetBuy;
  if (Number.isFinite(net)) southboundSeries.push({ date: snap.tradeDate, net });
}
if (Number.isFinite(snapshot.market.southboundNetBuy)) {
  southboundSeries.push({ date: snapshot.tradeDate, net: snapshot.market.southboundNetBuy });
}
snapshot.market.southboundSeries = southboundSeries.slice(-20);
console.log(`Southbound series: ${southboundSeries.length} trading days.`);

const focusCodes = focusCodesFor(snapshot);
if (focusCodes.length > 0) {
  const newsResults = await Promise.all(focusCodes.map(async (code) => {
    const keyword = searchKeywordFor(code, pool);
    try {
      const articles = await fetchEastmoneyStockNews({ keyword, date: tradeDate, limit: 1 });
      return [code, articles];
    } catch (error) {
      console.warn(`news skipped for ${code} (${keyword}): ${error.message}`);
      return null;
    }
  }));
  const newsByCode = {};
  for (const entry of newsResults) {
    if (entry && entry[1].length > 0) newsByCode[entry[0]] = entry[1];
  }
  const attached = Object.keys(newsByCode).length;
  for (const item of snapshot.securities) {
    if (newsByCode[item.code]) item.news = newsByCode[item.code];
  }
  for (const list of Object.values(snapshot.rankings)) {
    for (const item of list) {
      if (newsByCode[item.code]) item.news = newsByCode[item.code];
    }
  }
  console.log(`News attached: ${attached}/${focusCodes.length} focus stocks.`);
}

await fs.mkdir(path.join(outputDir, "daily"), { recursive: true });
await atomicWrite(path.join(outputDir, "daily", `${tradeDate}.json`), snapshot);
const latestPath = path.join(outputDir, "latest.json");
await atomicWrite(latestPath, snapshot);
const { size } = await fs.stat(latestPath);
console.log(`Generated ${tradeDate}: ${snapshot.coverage.matched}/${snapshot.coverage.universe} securities matched. Snapshot ${(size / 1048576).toFixed(2)} MB.`);

const retention = Number(process.env.ARCHIVE_RETENTION_DAYS ?? 0);
if (Number.isInteger(retention) && retention > 0) {
  const removed = await pruneArchives(tradeDate, retention);
  console.log(`Archive retention ${retention} days: removed ${removed.length} file(s)${removed.length ? ` (${removed.join(", ")})` : ""}.`);
}
