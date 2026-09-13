import { normalizeQuote } from "../lib/pipeline.mjs";

const ENDPOINT = "https://push2delay.eastmoney.com/api/qt/clist/get";
const UNIVERSE_ENDPOINT = "https://push2delay.eastmoney.com/api/qt/ulist.np/get";
const FIELDS = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f15,f16,f17,f18,f20,f23,f62,f100,f124,f184";
const PAGE_SIZE = 100;
const AH_FIELDS = "f12,f191,f2,f3,f186,f187,f188";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestUniverseBatch({ codes, fetchImpl, timeoutMs }) {
  const url = new URL(UNIVERSE_ENDPOINT);
  url.search = new URLSearchParams({
    fltt: "2",
    invt: "2",
    fields: FIELDS,
    secids: codes.map((code) => `116.${code}`).join(","),
  });
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://quote.eastmoney.com/",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Eastmoney returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data?.diff)) {
    throw new Error("Eastmoney response is missing data.diff");
  }
  return payload.data.diff.map(normalizeQuote);
}

export async function fetchEastmoneyUniverseQuotes(codes, {
  fetchImpl = fetch,
  timeoutMs = 15000,
  retries = 1,
  retryDelayMs = 800,
  batchSize = 200,
} = {}) {
  const allQuotes = [];
  for (let start = 0; start < codes.length; start += batchSize) {
    const batch = codes.slice(start, start + batchSize);
    let lastError;
    let quotes;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        quotes = await requestUniverseBatch({ codes: batch, fetchImpl, timeoutMs });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await wait(retryDelayMs);
      }
    }
    if (!quotes) {
      throw new Error(`Unable to fetch Eastmoney universe batch: ${lastError.message}`, { cause: lastError });
    }
    allQuotes.push(...quotes);
  }
  return allQuotes;
}

function optionalNumber(value) {
  const number = Number(value);
  return value === null || value === undefined || value === "-" || !Number.isFinite(number) ? null : number;
}

async function requestAhPage({ fetchImpl, timeoutMs, pageNumber }) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    np: "1",
    fltt: "2",
    invt: "2",
    fs: "b:DLMK0101",
    fields: AH_FIELDS,
    fid: "f3",
    pn: String(pageNumber),
    pz: String(PAGE_SIZE),
    po: "1",
    dect: "1",
  });
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json,text/plain,*/*", Referer: "https://quote.eastmoney.com/" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Eastmoney returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data?.diff)) throw new Error("Eastmoney AH response is missing data.diff");
  return { rows: payload.data.diff, total: Number(payload.data.total) };
}

export async function fetchEastmoneyAhPairs({
  fetchImpl = fetch,
  timeoutMs = 15000,
  retries = 1,
  retryDelayMs = 800,
} = {}) {
  const pairs = {};
  let pageNumber = 1;
  let fetched = 0;
  let total = Number.POSITIVE_INFINITY;
  while (fetched < total) {
    let page;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        page = await requestAhPage({ fetchImpl, timeoutMs, pageNumber });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await wait(retryDelayMs);
      }
    }
    if (!page) throw new Error(`Unable to fetch Eastmoney AH pairs: ${lastError.message}`, { cause: lastError });
    total = Number.isFinite(page.total) ? page.total : page.rows.length;
    for (const row of page.rows) {
      const hCode = String(row.f12 ?? "").padStart(5, "0");
      const aCode = String(row.f191 ?? "").padStart(6, "0");
      if (!/^\d{5}$/.test(hCode) || !/^\d{6}$/.test(aCode)) continue;
      pairs[hCode] = {
        aCode,
        aPrice: optionalNumber(row.f186),
        aChangePercent: optionalNumber(row.f187),
        hChangePercent: optionalNumber(row.f3),
        premiumPercent: optionalNumber(row.f188),
      };
    }
    fetched += page.rows.length;
    if (!page.rows.length || page.rows.length < PAGE_SIZE) break;
    pageNumber += 1;
  }
  return pairs;
}
