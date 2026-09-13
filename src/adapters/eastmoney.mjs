import { normalizeQuote } from "../lib/pipeline.mjs";

const ENDPOINT = "https://push2delay.eastmoney.com/api/qt/clist/get";
const UNIVERSE_ENDPOINT = "https://push2delay.eastmoney.com/api/qt/ulist.np/get";
const DATACENTER_ENDPOINT = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const FIELDS = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f15,f16,f17,f18,f20,f23,f62,f100,f124,f184";
const PAGE_SIZE = 100;
const AH_FIELDS = "f12,f191,f2,f3,f186,f187,f188";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url, { fetchImpl, timeoutMs, retries, retryDelayMs, referer = "https://data.eastmoney.com/" }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json,text/plain,*/*", Referer: referer },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Eastmoney returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(retryDelayMs);
    }
  }
  throw lastError;
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

export async function fetchEastmoneyShortSelling({
  tradeDate,
  fetchImpl = fetch,
  timeoutMs = 15000,
  retries = 1,
  retryDelayMs = 800,
  pageSize = 500,
} = {}) {
  const shortByCode = {};
  let pageNumber = 1;
  let pages = 1;
  while (pageNumber <= pages) {
    const url = new URL(DATACENTER_ENDPOINT);
    url.search = new URLSearchParams({
      reportName: "RPT_HK_SHORTSELLING",
      columns: "SECUCODE,SHORT_SELLING_AMT,DEAL_AMT,SHORT_SELLING_RATIO",
      filter: `(TRADE_DATE='${tradeDate}')`,
      pageSize: String(pageSize),
      pageNumber: String(pageNumber),
      sortColumns: "SHORT_SELLING_AMT",
      sortTypes: "-1",
    });
    const payload = await requestJson(url, { fetchImpl, timeoutMs, retries, retryDelayMs });
    const result = payload?.result;
    const rows = Array.isArray(result?.data) ? result.data : [];
    pages = Number.isInteger(result?.pages) && result.pages > 0 ? result.pages : pageNumber;
    for (const row of rows) {
      const code = String(row.SECUCODE ?? "").replace(".HK", "").trim();
      if (!/^\d{5}$/.test(code)) continue;
      shortByCode[code] = {
        shortRatio: optionalNumber(row.SHORT_SELLING_RATIO),
        shortAmt: optionalNumber(row.SHORT_SELLING_AMT),
      };
    }
    if (rows.length === 0) break;
    pageNumber += 1;
  }
  return shortByCode;
}

const SOUTHTBOUND_LEGS = ["002", "004"];

export async function fetchSouthboundFlow({
  fetchImpl = fetch,
  timeoutMs = 15000,
  retries = 1,
  retryDelayMs = 800,
} = {}) {
  const legs = await Promise.all(SOUTHTBOUND_LEGS.map(async (mutualType) => {
    const url = new URL(DATACENTER_ENDPOINT);
    url.search = new URLSearchParams({
      reportName: "RPT_MUTUAL_DEAL_HISTORY",
      columns: "TRADE_DATE,NET_DEAL_AMT,DEAL_AMT",
      filter: `(MUTUAL_TYPE="${mutualType}")`,
      pageSize: "1",
      sortColumns: "TRADE_DATE",
      sortTypes: "-1",
    });
    const payload = await requestJson(url, { fetchImpl, timeoutMs, retries, retryDelayMs });
    const row = payload?.result?.data?.[0];
    if (!row) throw new Error(`southbound leg ${mutualType} has no data`);
    return row;
  }));
  const dates = legs.map((row) => String(row.TRADE_DATE ?? "").slice(0, 10));
  const netDeal = legs.map((row) => optionalNumber(row.NET_DEAL_AMT));
  const deal = legs.map((row) => optionalNumber(row.DEAL_AMT));
  if (netDeal.some((value) => value === null) || deal.some((value) => value === null)) {
    throw new Error("southbound net buying is not disclosed for the latest session");
  }
  return {
    tradeDate: dates[0],
    netBuyHkd: Math.round((netDeal[0] + netDeal[1]) * 1e6),
    turnoverHkd: Math.round((deal[0] + deal[1]) * 1e6),
  };
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
