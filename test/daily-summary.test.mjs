import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySummary } from "../src/lib/daily-summary.mjs";

const snapshot = {
  tradeDate: "2026-09-14",
  generatedAt: "2026-09-14T10:13:00.000Z",
  market: {
    advancers: 268,
    decliners: 379,
    turnover: 133_824_000_000,
    southboundNetBuy: 4_471_480_000,
  },
  rankings: {
    turnover: [
      { code: "02513", name: "智谱", turnover: 7_967_000_000, changePercent: -9.08, turnoverRate: 2.93, close: 728.5, high52: 990, low52: 300 },
      { code: "09988", name: "阿里巴巴-W", turnover: 5_122_000_000, changePercent: -1.49, turnoverRate: 0.1, close: 105.6, high52: 140, low52: 60 },
      { code: "00700", name: "腾讯控股", turnover: 4_892_000_000, changePercent: 0.51, turnoverRate: 0.06, close: 429.8, high52: 431, low52: 419.4 },
      { code: "01810", name: "小米集团-W", turnover: 1_000_000_000, changePercent: 3.03, turnoverRate: 0.24, close: 27, high52: 35, low52: 20 },
      { code: "01024", name: "快手-W", turnover: 900_000_000, changePercent: -2.18, turnoverRate: 0.3, close: 55, high52: 90, low52: 54 },
    ],
  },
};

test("buildDailySummary follows the editorial template with computed figures", () => {
  const text = buildDailySummary(snapshot);
  const lines = text.split("\n");
  assert.match(lines[0], /【港股通资金雷达｜09月14日 数据盘点】/);
  assert.match(text, /南向资金今日单日净买入 44\.71 亿港币。/);
  assert.match(text, /港股通总成交额 1338\.24 亿港币。/);
  assert.match(text, /港股通全市场 268 家上涨、379 家下跌；成交额 Top 50 榜单中 2 涨、3 跌（平均涨跌幅 -1\.84%）。/);
  assert.match(text, /Top 10 标的成交额占 Top 50 总成交额的 \d+\.\d+%/);
  assert.match(text, /\$智谱\(02513\)\$：成交额 79\.67 亿港币（榜首），涨跌幅 -9\.08%。/);
  assert.match(text, /涨幅前三：\$小米集团-W\(01810\)\$（\+3\.03%）、\$腾讯控股\(00700\)\$（\+0\.51%）、\$阿里巴巴-W\(09988\)\$（-1\.49%）。/);
  assert.match(text, /跌幅前三：\$智谱\(02513\)\$（-9\.08%）、\$快手-W\(01024\)\$（-2\.18%）、\$阿里巴巴-W\(09988\)\$（-1\.49%）。/);
  assert.match(text, /新高\/新低纪录：\$腾讯控股\(00700\)\$ 股价创阶段新高（涨跌幅 \+0\.51%）；\$快手-W\(01024\)\$ 创阶段新低（涨跌幅 -2\.18%）。/);
  assert.match(text, /最大涨跌极值：全榜最高涨幅为 \$小米集团-W\(01810\)\$（\+3\.03%），最大跌幅为 \$智谱\(02513\)\$（-9\.08%）。/);
  assert.match(text, /数据来源：港股通收盘快照（截至 \d{2}:\d{2}）/);
  assert.match(text, /\$智谱\(02513\)\$ \$阿里巴巴-W\(09988\)\$ \$腾讯控股\(00700\)\$/);
});

test("buildDailySummary annotates a carried-forward southbound value", () => {
  const carried = {
    ...snapshot,
    market: { ...snapshot.market, southboundNetBuy: 4_431_020_000, southboundAsOf: "2026-09-11" },
  };
  assert.match(buildDailySummary(carried), /净买入 44\.31 亿港币（09\/11值）。/);
});

test("buildDailySummary rejects an empty ranking", () => {
  assert.throws(() => buildDailySummary({ market: {}, rankings: {} }), /turnover ranking/);
});
