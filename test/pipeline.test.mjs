import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildContinuity,
  buildSnapshot,
  normalizeQuote,
  rankQuotes,
  rankableUniverse,
  sameMarketSnapshot,
  validateCoverage,
} from "../src/lib/pipeline.mjs";

const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/eastmoney-quotes.json", import.meta.url)));
const universe = new Set(["00001", "00700", "09988"]);

test("normalizeQuote maps Eastmoney fields without stringifying numbers", () => {
  assert.deepEqual(normalizeQuote(fixture.data.diff[0]), {
    code: "00001",
    name: "长和",
    close: 70.35,
    changePercent: 1.44,
    change: 1,
    volume: 5609920,
    turnover: 392325440,
    amplitude: 1.66,
    turnoverRate: 0.15,
    peTtm: 8.5,
    pb: 0.92,
    marketCap: 268000000000,
    high: 70.35,
    low: 69.2,
    open: 69.5,
    previousClose: 69.35,
    mainNetInflow: -12300000,
    mainNetInflowRatio: -3.14,
    industry: "综合企业",
    timestamp: 1788969600,
  });
  const missingOptional = normalizeQuote(fixture.data.diff[3]);
  assert.equal(missingOptional.mainNetInflow, null);
  assert.equal(missingOptional.industry, null);
  assert.equal(missingOptional.peTtm, null);
  assert.equal(missingOptional.pb, null);
});

test("rankQuotes filters to the universe and sorts all three rankings", () => {
  const quotes = fixture.data.diff.map(normalizeQuote);
  const rankings = rankQuotes(quotes, universe, 2);
  assert.deepEqual(rankings.turnover.map((item) => item.code), ["00700", "09988"]);
  assert.deepEqual(rankings.gainers.map((item) => item.code), ["00700", "00001"]);
  assert.deepEqual(rankings.losers.map((item) => item.code), ["09988", "00001"]);
  assert.equal(rankings.turnover.some((item) => item.code === "99999"), false);
});

test("rankQuotes excludes missing ranking values and uses code as a stable tie-breaker", () => {
  const quotes = [
    { code: "00002", turnover: 100, changePercent: 1 },
    { code: "00001", turnover: 100, changePercent: null },
  ];
  const rankings = rankQuotes(quotes, new Set(["00001", "00002"]), 30);
  assert.deepEqual(rankings.turnover.map((item) => item.code), ["00001", "00002"]);
  assert.deepEqual(rankings.gainers.map((item) => item.code), ["00002"]);
});

test("validateCoverage rejects a snapshot below the configured threshold", () => {
  assert.throws(() => validateCoverage(50, 100, 0.8), /coverage 50.0% is below 80.0%/);
  assert.equal(validateCoverage(90, 100, 0.8), 0.9);
});

test("buildSnapshot adds profiles and a market summary", () => {
  const quotes = fixture.data.diff.map(normalizeQuote);
  const profiles = { "00700": { industry: "互联网", introduction: "社交与数字内容平台。" } };
  const ahPairs = { "00700": { aCode: "600700", aChangePercent: 1.2, hChangePercent: 2.5, premiumPercent: 8.4 } };
  const snapshot = buildSnapshot({
    quotes,
    universe: [{ code: "00001" }, { code: "00700" }, { code: "09988" }],
    profiles,
    ahPairs,
    generatedAt: "2026-09-10T08:30:00.000Z",
    tradeDate: "2026-09-10",
    limit: 50,
  });
  assert.equal(snapshot.coverage.matched, 3);
  assert.equal(snapshot.market.advancers, 2);
  assert.equal(snapshot.market.decliners, 1);
  assert.equal(snapshot.market.turnover, 14492325440);
  assert.equal(snapshot.market.mainNetInflow, 286000720);
  assert.equal(snapshot.rankings.turnover[0].industry, "互联网");
  assert.equal(snapshot.rankings.turnover[0].introduction, "社交与数字内容平台。");
  assert.equal(snapshot.rankings.turnover[0].ah.aCode, "600700");
  assert.equal(snapshot.securities.length, 3);
  assert.equal(snapshot.securities.find((item) => item.code === "00700").ah.aCode, "600700");
  assert.equal("continuity" in snapshot.rankings.turnover[0], false);
});

test("buildSnapshot falls back to the quote industry when profiles omit it", () => {
  const quotes = fixture.data.diff.map(normalizeQuote);
  const snapshot = buildSnapshot({
    quotes,
    universe: [{ code: "00001" }, { code: "00700" }, { code: "09988" }],
    generatedAt: "2026-09-10T08:30:00.000Z",
    tradeDate: "2026-09-10",
    limit: 50,
  });
  assert.equal(snapshot.rankings.turnover[0].industry, "软件服务");
  assert.equal(snapshot.rankings.turnover[1].industry, "专业零售");
});

test("buildContinuity tracks streaks, prior rank and turnover averages", () => {
  const priorDay = {
    rankings: { turnover: [{ code: "00700" }, { code: "09988" }] },
    securities: [
      { code: "00700", turnover: 9_000_000_000 },
      { code: "09988", turnover: 5_100_000_000 },
      { code: "00001", turnover: 392_325_440 },
    ],
  };
  const dayBefore = {
    rankings: { turnover: [{ code: "09988" }, { code: "00700" }, { code: "00001" }] },
    securities: [
      { code: "00700", turnover: 8_000_000_000 },
      { code: "09988", turnover: 4_000_000_000 },
    ],
  };
  const history = buildContinuity([priorDay, dayBefore]);
  assert.equal(history.basedOn, 2);
  assert.deepEqual(history.streakByCode["00700"], { top50Days: 2, prevRank: 1 });
  assert.deepEqual(history.streakByCode["09988"], { top50Days: 2, prevRank: 2 });
  assert.equal(history.streakByCode["00001"], undefined);
  assert.equal(history.avgByCode["00700"], 8_500_000_000);
  assert.equal(history.avgByCode["00001"], 392_325_440);
  const empty = buildContinuity([]);
  assert.equal(empty.basedOn, 0);
});

test("buildSnapshot attaches continuity for turnover Top 50 members when history exists", () => {
  const quotes = fixture.data.diff.map(normalizeQuote);
  const priorDay = {
    rankings: { turnover: [{ code: "09988" }, { code: "00700" }] },
    securities: [
      { code: "09988", turnover: 5_100_000_000 },
      { code: "00700", turnover: 9_000_000_000 },
    ],
  };
  const snapshot = buildSnapshot({
    quotes,
    universe: [{ code: "00001" }, { code: "00700" }, { code: "09988" }],
    history: buildContinuity([priorDay]),
    generatedAt: "2026-09-11T08:30:00.000Z",
    tradeDate: "2026-09-11",
    limit: 2,
  });
  const tencent = snapshot.rankings.turnover.find((item) => item.code === "00700");
  assert.deepEqual(tencent.continuity, { top50Days: 2, prevRank: 2, isNew: false, avgTurnover5d: 9_000_000_000 });
  const changhe = snapshot.securities.find((item) => item.code === "00001");
  assert.equal("continuity" in changhe, false);
  assert.equal(snapshot.rankings.gainers.find((item) => item.code === "00700").continuity.top50Days, 2);
});

test("rankableUniverse drops etf entries and keeps untyped stocks", () => {
  const universe = [
    { code: "00700", type: "security" },
    { code: "02800", type: "etf" },
    { code: "00001" },
  ];
  assert.deepEqual(rankableUniverse(universe).map((item) => item.code), ["00700", "00001"]);
});

test("buildSnapshot excludes etf universe entries from coverage, rankings and securities", () => {
  const quotes = fixture.data.diff.map(normalizeQuote);
  const snapshot = buildSnapshot({
    quotes,
    universe: [{ code: "00001", type: "security" }, { code: "02800", type: "etf" }, { code: "00700", type: "security" }, { code: "09988", type: "security" }],
    generatedAt: "2026-09-10T08:30:00.000Z",
    tradeDate: "2026-09-10",
    limit: 50,
  });
  assert.equal(snapshot.coverage.universe, 3);
  assert.equal(snapshot.coverage.matched, 3);
  const tracker = quotes.find((quote) => quote.code === "02800");
  assert.equal(tracker, undefined);
  assert.equal(snapshot.securities.some((item) => item.code === "02800"), false);
  assert.equal(snapshot.market.turnover, 14492325440);
});

test("sameMarketSnapshot ignores generation time when market timestamps match", () => {
  const current = { tradeDate: "2026-09-10", marketStatus: "close", securities: [{ timestamp: 100 }, { timestamp: 120 }] };
  const candidate = { tradeDate: "2026-09-10", marketStatus: "close", securities: [{ timestamp: 120 }] };
  assert.equal(sameMarketSnapshot(current, candidate), true);
  assert.equal(sameMarketSnapshot(current, { ...candidate, tradeDate: "2026-09-11" }), false);
  assert.equal(sameMarketSnapshot(current, { ...candidate, securities: [{ timestamp: 121 }] }), false);
  assert.equal(sameMarketSnapshot(current, { ...candidate, marketStatus: "intraday" }), false);
});
