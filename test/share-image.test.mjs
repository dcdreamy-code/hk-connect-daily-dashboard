import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildDailyInsights, buildShareImageSvg } from "../src/lib/share-image.mjs";

const snapshot = JSON.parse(await fs.readFile(new URL("../public/data/latest.json", import.meta.url)));

test("buildShareImageSvg renders single-line securities in a 1242 x 3660 report", () => {
  const svg = buildShareImageSvg(snapshot);
  assert.match(svg, /<svg[^>]+width="1242"[^>]+height="3660"/);
  assert.equal((svg.match(/data-rank-row=/g) || []).length, 50);
  assert.equal((svg.match(/data-security-line=/g) || []).length, 50);
  assert.equal((svg.match(/class="sub-label"/g) || []).length, 0);
  assert.equal((svg.match(/data-group-divider=/g) || []).length, 5);
  assert.match(svg, /总市值/);
  assert.match(svg, /换手率/);
  assert.match(svg, />AH</);
  assert.match(svg, /data-loss-mark=/);
  assert.match(svg, />亏</);
  assert.match(svg, /今日观察/);
  assert.match(svg, /成交集中度/);
  assert.match(svg, /港美侠/);
  assert.match(svg, /港股通每日资金榜/);
  assert.match(svg, /港美侠出品/);
  assert.doesNotMatch(svg, /rx="(?:14|22)"/);
  assert.match(svg, new RegExp(snapshot.tradeDate));
});

test("buildDailyInsights derives traceable facts from turnover Top 50", () => {
  const insights = buildDailyInsights(snapshot.rankings.turnover);
  assert.equal(insights.bullets.length, 3);
  assert.match(insights.headline, /Top 50 榜单 \d+ 涨 \d+ 跌/);
  assert.match(insights.bullets[0], /Top 10 占 Top 50 成交额/);
  assert.match(insights.bullets[1], new RegExp(snapshot.rankings.turnover[0].name));
  const extremeUp = snapshot.rankings.turnover.toSorted((a, b) => b.changePercent - a.changePercent)[0];
  const extremeDown = snapshot.rankings.turnover.toSorted((a, b) => a.changePercent - b.changePercent)[0];
  const scan = insights.bullets[2];
  assert.match(scan, new RegExp(extremeUp.name));
  assert.match(scan, new RegExp(extremeDown.name));
});
