import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { compactHkd, formatPercent, formatRate } from "../src/lib/format.mjs";
import {
  filterRanking,
  isNewerSnapshot,
  profitabilityCounts,
  rangePosition,
  summarizeRanking,
  sortSecurities,
  turnoverShare,
  xueqiuUrl,
} from "../app.js";

const rankings = {
  turnover: [{ code: "00700", name: "腾讯控股", turnover: 9_100_000_000, changePercent: 2.5 }],
  gainers: [{ code: "00100", name: "MINIMAX-W", turnover: 3_000_000_000, changePercent: 8.1 }],
  losers: [{ code: "09988", name: "阿里巴巴-W", turnover: 5_000_000_000, changePercent: -3.2 }],
};

test("formatters preserve signs and compact Hong Kong dollar units", () => {
  assert.equal(formatPercent(2.5), "+2.50%");
  assert.equal(formatPercent(-3.2), "-3.20%");
  assert.equal(compactHkd(9_100_000_000), "91.00亿");
  assert.equal(compactHkd(null), "--");
  assert.equal(formatRate(2.5), "2.50%");
});

test("compactHkd uses the same unit on the page and in the share image", () => {
  assert.equal(compactHkd(1_500_000_000_000), "1.50万亿");
  assert.equal(compactHkd(3_919_822_000_000), "3.92万亿");
  assert.equal(compactHkd(133_824_057_637), "1338.24亿");
  assert.equal(compactHkd(52_300), "5.2万");
  assert.equal(compactHkd(5000), "5,000");
  assert.equal(compactHkd(-2_000_000_000_000), "-2.00万亿");
});


test("filterRanking matches either code or name without case sensitivity", () => {
  assert.equal(filterRanking(rankings.turnover, "700").length, 1);
  assert.equal(filterRanking(rankings.turnover, "腾讯").length, 1);
  assert.equal(filterRanking(rankings.gainers, "minimax").length, 1);
  assert.equal(filterRanking(rankings.turnover, "阿里").length, 0);
});

test("xueqiuUrl uses the five-digit Hong Kong code as the path suffix", () => {
  assert.equal(xueqiuUrl("01888"), "https://xueqiu.com/S/01888");
  assert.equal(xueqiuUrl("700"), "https://xueqiu.com/S/00700");
});

test("isNewerSnapshot accepts only snapshots with a later generatedAt", () => {
  const current = { generatedAt: "2026-09-10T06:00:00.000Z" };
  assert.equal(isNewerSnapshot(current, { generatedAt: "2026-09-10T08:30:00.000Z" }), true);
  assert.equal(isNewerSnapshot(current, { generatedAt: "2026-09-10T05:30:00.000Z" }), false);
  assert.equal(isNewerSnapshot(current, { generatedAt: "invalid" }), false);
});

test("summarizeRanking calculates turnover and change statistics for the full list", () => {
  const summary = summarizeRanking([
    { turnover: 100, marketCap: 1000, changePercent: 3, ah: { aCode: "600001" } },
    { turnover: 300, marketCap: 3000, changePercent: -1, ah: null },
    { turnover: 200, marketCap: 2000, changePercent: 0, ah: { aCode: "600003" } },
    { turnover: null, marketCap: null, changePercent: 2, ah: null },
  ]);
  assert.equal(summary.averageTurnover, 200);
  assert.equal(summary.medianTurnover, 200);
  assert.equal(summary.averageMarketCap, 2000);
  assert.equal(summary.medianMarketCap, 2000);
  assert.equal(summary.ahCount, 2);
  assert.equal(summary.averageChangePercent, 1);
  assert.equal(summary.medianChangePercent, 1);
  assert.deepEqual(
    [summary.advancers, summary.decliners, summary.unchanged],
    [2, 1, 1],
  );
  assert.equal(summary.maxChangePercent, 3);
  assert.equal(summary.minChangePercent, -1);
});

test("sortSecurities sorts the full universe with missing values last", () => {
  const items = [
    { code: "00001", marketCap: 100, turnoverRate: null, changePercent: -1 },
    { code: "00003", marketCap: null, turnoverRate: 3, changePercent: 2 },
    { code: "00002", marketCap: 300, turnoverRate: 1, changePercent: 0 },
  ];
  assert.deepEqual(sortSecurities(items, "marketCap", "desc", 50).map((item) => item.code), ["00002", "00001", "00003"]);
  assert.deepEqual(sortSecurities(items, "changePercent", "asc", 2).map((item) => item.code), ["00001", "00002"]);
});

test("dashboard exposes quote time and freshness status", async () => {
  const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="quote-time"/);
  assert.match(html, /id="freshness-text"/);
});

test("dashboard exposes the daily summary section for one-click publishing", async () => {
  const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="summary-text"/);
  assert.match(html, /id="copy-summary"/);
  assert.match(html, /class="summary-section"/);
});

test("dashboard presents the Gangmeixia editorial brand and daily observation", async () => {
  const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, />港美侠</);
  assert.match(html, />港股通每日资金榜</);
  assert.match(html, /id="daily-view"/);
  assert.match(html, /id="observation-list"/);
  assert.match(html, /id="issue-number"/);
  assert.match(html, /id="concentration-value"/);
  assert.match(html, /id="focus-ranking"/);
});

test("turnoverShare returns a bounded percentage of the ranking leader", () => {
  assert.equal(turnoverShare(50, 100), 50);
  assert.equal(turnoverShare(150, 100), 100);
  assert.equal(turnoverShare(null, 100), 0);
});

test("profitabilityCounts classifies TTM earnings and ignores missing values", () => {
  const counts = profitabilityCounts([
    { peTtm: 14.61 },
    { peTtm: -73.73 },
    { peTtm: 0 },
    { peTtm: null },
    {},
  ]);
  assert.deepEqual(counts, { profitable: 1, losing: 1 });
});

test("rangePosition maps close into the 52-week band with clamping", () => {
  assert.equal(rangePosition(25, 100, 0), 25);
  assert.equal(rangePosition(100, 100, 0), 100);
  assert.equal(rangePosition(0, 100, 0), 0);
  assert.equal(rangePosition(500, 456.2, 419.4), 100);
  assert.equal(rangePosition(300, 456.2, 419.4), 0);
  assert.equal(rangePosition(430, 430, 430), null);
  assert.equal(rangePosition(430, null, 419.4), null);
});
