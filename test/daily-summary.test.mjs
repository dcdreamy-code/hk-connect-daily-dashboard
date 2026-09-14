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

test("polarized sessions use the observation column and concentration opening", () => {
  const stocks = [
    { name: "龙头股", code: "00001", turnover: 6_000_000_000, changePercent: 2.5, turnoverRate: 3, close: 100, high52: 105, low52: 90 },
    ...makeStocks(12, 2).map((item) => ({ ...item, turnover: 100_000_000, changePercent: -1 })),
  ];
  const text = buildDailySummary(baseSnapshot(stocks, { market: { southboundNetBuy: 5_000_000_000 } }));
  assert.match(text, /【港股通数据观察】 \| 09月14日/);
  assert.match(text, /南向资金单日扫货 50\.00 亿，但资金集中度达到了 \d+\.\d%，头部博弈迹象明显。/);
  assert.match(text, /📊 整体交投概览/);
  assert.match(text, /🏆 头部成交分布（Top 10 数据）/);
  assert.match(text, /• 成交第一：龙头股 成交 60\.00 亿（涨跌幅 \+2\.50%）/);
  assert.match(text, /🔍 榜单焦点与异动（Top 50 监测）/);
  assert.match(text, /数据来源：港股通收盘正式快照（截至 \d{2}:\d{2}）/);
});

test("rotation sessions use the radar column and turnover focus", () => {
  const stocks = [
    { name: "高换手股", code: "00002", turnover: 1_500_000_000, changePercent: 4.2, turnoverRate: 18.5, close: 50, high52: 52, low52: 40 },
    ...makeStocks(23, 2),
  ];
  const text = buildDailySummary(baseSnapshot(stocks, { market: { southboundNetBuy: -1_200_000_000 } }));
  assert.match(text, /【港股通每日异动雷达】 \| 09月14日/);
  assert.match(text, /从今天港股通 Top 50 榜单来看，整体呈现 \d+ 涨 \d+ 跌的格局，南向资金净流出 12\.00 亿。/);
  assert.match(text, /• 换手率焦点：高换手股 换手率 18\.50%，成交 15\.00 亿，收 \+4\.20%/);
});

test("brief sessions use the snapshot column and alternate opening on odd days", () => {
  const text = buildDailySummary(baseSnapshot(makeStocks(24, 2), { tradeDate: "2026-09-15", generatedAt: "2026-09-15T10:13:00.000Z" }));
  assert.match(text, /【港股通资金快照】 \| 09月15日/);
  assert.match(text, /今日港股通交投总额 [\d.]+ 亿，活跃股整体表现如下：/);
  assert.match(text, /📊 整体交投概览/);
});

test("negative southbound uses outflow wording and annotations carry the as-of date", () => {
  const carried = baseSnapshot(makeStocks(24, 2), {
    market: { southboundNetBuy: -800_000_000, southboundAsOf: "2026-09-11" },
  });
  const text = buildDailySummary(carried);
  assert.match(text, /南向资金：净卖出 8\.00 亿港币（09\/11值）/);
});

test("buildDailySummary rejects an empty ranking", () => {
  assert.throws(() => buildDailySummary({ market: {}, rankings: {} }), /turnover ranking/);
});
