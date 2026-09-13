function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

export function normalizeCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 5) throw new Error(`invalid Hong Kong stock code: ${value}`);
  return digits.padStart(5, "0");
}

export function rankableUniverse(universe) {
  return universe.filter((item) => item.type !== "etf");
}

export function normalizeQuote(raw) {
  return {
    code: normalizeCode(raw.f12),
    name: String(raw.f14 ?? "").trim(),
    close: finiteNumber(raw.f2),
    changePercent: finiteNumber(raw.f3),
    change: finiteNumber(raw.f4),
    volume: finiteNumber(raw.f5),
    turnover: finiteNumber(raw.f6),
    amplitude: finiteNumber(raw.f7),
    turnoverRate: finiteNumber(raw.f8),
    peTtm: finiteNumber(raw.f9),
    pb: finiteNumber(raw.f23),
    marketCap: finiteNumber(raw.f20),
    high: finiteNumber(raw.f15),
    low: finiteNumber(raw.f16),
    open: finiteNumber(raw.f17),
    previousClose: finiteNumber(raw.f18),
    mainNetInflow: finiteNumber(raw.f62),
    mainNetInflowRatio: finiteNumber(raw.f184),
    industry: optionalText(raw.f100),
    timestamp: finiteNumber(raw.f124),
  };
}

function byMetric(metric, direction) {
  return (left, right) => {
    const difference = direction * (right[metric] - left[metric]);
    return difference || left.code.localeCompare(right.code);
  };
}

function ranked(quotes, metric, direction, limit) {
  return quotes
    .filter((quote) => Number.isFinite(quote[metric]))
    .toSorted(byMetric(metric, direction))
    .slice(0, limit);
}

export function rankQuotes(quotes, universeCodes, limit = 30) {
  const eligible = quotes.filter((quote) => universeCodes.has(quote.code));
  return {
    turnover: ranked(eligible, "turnover", 1, limit),
    gainers: ranked(eligible, "changePercent", 1, limit),
    losers: ranked(eligible, "changePercent", -1, limit),
  };
}

export function validateCoverage(matched, total, minimum = 0.8) {
  if (!Number.isInteger(total) || total <= 0) throw new Error("universe is empty");
  const ratio = matched / total;
  if (ratio < minimum) {
    throw new Error(`coverage ${(ratio * 100).toFixed(1)}% is below ${(minimum * 100).toFixed(1)}%`);
  }
  return ratio;
}

function latestMarketTimestamp(snapshot) {
  const timestamps = (snapshot?.securities ?? []).map((item) => item.timestamp).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function sameMarketSnapshot(current, candidate) {
  const currentTimestamp = latestMarketTimestamp(current);
  const candidateTimestamp = latestMarketTimestamp(candidate);
  return current?.tradeDate === candidate?.tradeDate
    && current?.marketStatus === candidate?.marketStatus
    && currentTimestamp !== null
    && currentTimestamp === candidateTimestamp;
}

function enrich(quote, profiles, ahPairs, shortSelling) {
  const profile = profiles[quote.code] ?? {};
  const short = shortSelling[quote.code] ?? null;
  return {
    ...quote,
    industry: profile.industry ?? quote.industry ?? null,
    introduction: profile.introduction ?? null,
    ah: ahPairs[quote.code] ?? null,
    shortRatio: short?.shortRatio ?? null,
    shortAmt: short?.shortAmt ?? null,
  };
}

export function buildContinuity(previousSnapshots) {
  const history = { basedOn: previousSnapshots.length, streakByCode: {}, avgByCode: {} };
  const sums = new Map();
  const days = new Map();
  let active = new Set();
  previousSnapshots.forEach((snapshot, index) => {
    const turnoverTop = snapshot.rankings?.turnover ?? [];
    if (index === 0) {
      turnoverTop.forEach((item, position) => {
        history.streakByCode[item.code] = { top50Days: 1, prevRank: position + 1 };
      });
      active = new Set(turnoverTop.map((item) => item.code));
    } else {
      const onList = new Set(turnoverTop.map((item) => item.code));
      active = new Set([...active].filter((code) => {
        if (!onList.has(code)) return false;
        history.streakByCode[code].top50Days += 1;
        return true;
      }));
    }
    for (const security of snapshot.securities ?? []) {
      if (!Number.isFinite(security.turnover)) continue;
      sums.set(security.code, (sums.get(security.code) ?? 0) + security.turnover);
      days.set(security.code, (days.get(security.code) ?? 0) + 1);
    }
  });
  for (const [code, sum] of sums) history.avgByCode[code] = sum / days.get(code);
  return history;
}

export function buildSnapshot({
  quotes,
  universe,
  profiles = {},
  ahPairs = {},
  history = null,
  shortSelling = {},
  southbound = null,
  generatedAt,
  tradeDate,
  marketStatus = "close",
  limit = 30,
  minimumCoverage = 0.8,
}) {
  const universeCodes = new Set(rankableUniverse(universe).map((item) => normalizeCode(item.code)));
  const eligible = quotes.filter((quote) => universeCodes.has(quote.code));
  const coverageRatio = validateCoverage(eligible.length, universeCodes.size, minimumCoverage);
  const rankings = rankQuotes(eligible, universeCodes, limit);
  const continuityBase = history && history.basedOn > 0 ? history : null;
  const top50Codes = new Set(rankings.turnover.map((item) => item.code));
  const enrichList = (items) => items.map((item) => {
    const enriched = enrich(item, profiles, ahPairs, shortSelling);
    if (!continuityBase || !top50Codes.has(item.code)) return enriched;
    const streak = continuityBase.streakByCode[item.code];
    return {
      ...enriched,
      continuity: {
        top50Days: streak ? streak.top50Days + 1 : 1,
        prevRank: streak ? streak.prevRank : null,
        isNew: !streak,
        avgTurnover5d: continuityBase.avgByCode[item.code] ?? null,
      },
    };
  });
  const securities = enrichList(eligible);

  return {
    schemaVersion: 2,
    tradeDate,
    generatedAt,
    marketStatus,
    source: {
      market: "东方财富网页行情",
      profiles: "Wind 与东方财富 F10 静态资料",
      notice: `${marketStatus === "intraday" ? "盘中快照" : "收盘数据"}，仅供信息参考，不构成投资建议。`,
    },
    coverage: {
      universe: universeCodes.size,
      matched: eligible.length,
      ratio: coverageRatio,
    },
    market: {
      advancers: eligible.filter((quote) => quote.changePercent > 0).length,
      decliners: eligible.filter((quote) => quote.changePercent < 0).length,
      unchanged: eligible.filter((quote) => quote.changePercent === 0).length,
      turnover: eligible.reduce((sum, quote) => sum + (quote.turnover ?? 0), 0),
      mainNetInflow: eligible.reduce((sum, quote) => sum + (quote.mainNetInflow ?? 0), 0),
      southboundNetBuy: southbound && southbound.tradeDate === tradeDate ? southbound.netBuyHkd : null,
    },
    securities,
    rankings: {
      turnover: enrichList(rankings.turnover),
      gainers: enrichList(rankings.gainers),
      losers: enrichList(rankings.losers),
    },
  };
}
