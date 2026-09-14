import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySummary, pickDailyStyle } from "../src/lib/daily-summary.mjs";

function makeStocks(count, turnoverRateMax = 1) {
  return Array.from({ length: count }, (_, index) => ({
    name: `测试股${index + 1}`,
    code: String(10000 + index),
    turnover: 500_000_000,
    changePercent: index % 2 === 0 ? 0.5 : -0.5,
    turnoverRate: Math.min(turnoverRateMax, 0.5 + index * 0.1),
    close: 100,
    high52: 110,
    low52: 90,
  }));
}

function baseSnapshot(stocks, overrides = {}) {
  return {
    tradeDate: overrides.tradeDate ?? "2026-09-14",
    generatedAt: overrides.generatedAt ?? "2026-09-14T10:13:00.000Z",
    market: {
      advancers: 200,
      decliners: 300,
      turnover: 90_000_000_000,
      southboundNetBuy: 4_471_480_000,
      ...overrides.market,
    },
    rankings: { turnover: stocks },
    securities: stocks,
  };
}

test("pickDailyStyle classifies polarized, rotation and brief sessions", () => {
  const leader = { name: "龙头", code: "00001", turnover: 6_000_000_000, changePercent: 1, turnoverRate: 2 };
  const small = makeStocks(22, 1).map((item) => ({ ...item, turnover: 100_000_000 }));
  assert.equal(pickDailyStyle(baseSnapshot([leader, ...small])), "polarized");
  const rotationStocks = makeStocks(24, 2);
  rotationStocks[23].turnoverRate = 18.5;
  assert.equal(pickDailyStyle(baseSnapshot(rotationStocks)), "rotation");
  assert.equal(pickDailyStyle(baseSnapshot(makeStocks(24, 2))), "brief");
});

test("polarized sessions lead with concentration and keep the observation columns", () => {
  const stocks = [
    { name: "龙头股", code: "00001", turnover: 6_000_000_000, changePercent: 2.5, turnoverRate: 3, close: 100, high52: 105, low52: 90 },
    ...makeStocks(12, 2).map((item) => ({ ...item, turnover: 100_000_000, changePercent: -1 })),
  ];
  const text = buildDailySummary(baseSnapshot(stocks, { market: { southboundNetBuy: 5_000_000_000 } }));
  assert.match(text, /【港股通数据观察】 \| 09月14日/);
  assert.match(text, /资金高度集中的交易日：Top 10 标的合计占去全榜 \d+\.\d% 的成交。/);
  assert.match(text, /港股通标的今日合计成交 \d+\.\d+ 亿/);
  assert.match(text, /龙头股以 \d+\.\d+ 亿成交领跑全榜/);
  assert.doesNotMatch(text, /📊|🏆|🔍/);
});

test("rotation sessions lead with the turnover standout", () => {
  const stocks = [
    { name: "高换手股", code: "00002", turnover: 1_500_000_000, changePercent: 4.2, turnoverRate: 18.5, close: 50, high52: 52, low52: 40 },
    ...makeStocks(23, 2),
  ];
  const text = buildDailySummary(baseSnapshot(stocks, { market: { southboundNetBuy: -1_200_000_000 } }));
  assert.match(text, /【港股通每日异动雷达】 \| 09月14日/);
  assert.match(text, /盘面异动不少：单日换手率最高升至 18\.50%。/);
  assert.match(text, /南向资金全天净流出 12\.00 亿/);
});

test("brief sessions on odd days open with the dated snapshot line", () => {
  const text = buildDailySummary(baseSnapshot(makeStocks(24, 2), { tradeDate: "2026-09-15", generatedAt: "2026-09-15T10:13:00.000Z" }));
  assert.match(text, /【港股通资金快照】 \| 09月15日/);
  assert.match(text, /09月15日港股通收盘快照：南向资金净流入 \d+\.\d+ 亿，Top 50 榜单平均涨跌幅为/);
  assert.match(text, /港股通标的今日合计成交 \d+\.\d+ 亿/);
});

test("negative southbound uses outflow wording and annotations carry the as-of date", () => {
  const carried = baseSnapshot(makeStocks(24, 2), {
    market: { southboundNetBuy: -800_000_000, southboundAsOf: "2026-09-11" },
  });
  const text = buildDailySummary(carried);
  assert.match(text, /南向资金全天净流出 8\.00 亿/);
  assert.match(text, /（09\/11值）/);
});

test("top three turnover leaders are narrated with varied verbs", () => {
  const stocks = [
    { name: "智谱", code: "02513", turnover: 7_967_000_000, changePercent: -9.08, turnoverRate: 2.93, close: 728.5, high52: 990, low52: 300 },
    { code: "09988", name: "阿里巴巴-W", turnover: 5_122_000_000, changePercent: -1.49, turnoverRate: 0.1, close: 105.6, high52: 140, low52: 60 },
    { code: "00700", name: "腾讯控股", turnover: 4_892_000_000, changePercent: 0.51, turnoverRate: 0.06, close: 429.8, high52: 431, low52: 419.4 },
  ];
  const text = buildDailySummary(baseSnapshot(stocks));
  assert.match(text, /智谱以 79\.67 亿成交领跑全榜，收跌 9\.08%；阿里巴巴-W成交 51\.22 亿紧随其后，收跌 1\.49%；腾讯控股成交 48\.92 亿位列第三，收涨 0\.51%。/);
});

test("buildDailySummary rejects an empty ranking", () => {
  assert.throws(() => buildDailySummary({ market: {}, rankings: {} }), /turnover ranking/);
});
