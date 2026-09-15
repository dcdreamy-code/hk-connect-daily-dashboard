import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildSnapshot } from "../src/lib/pipeline.mjs";
import { buildShareImageSvg } from "../src/lib/share-image.mjs";

const read = async (relative) => JSON.parse(await fs.readFile(new URL(relative, import.meta.url), "utf8"));

const snapshot = await read("../public/data/latest.json");
const universe = await read("../data/universe.json");
const profiles = await read("../data/company-profiles.json");
const ahPairs = (await read("../public/data/ah-pairs.json")).pairs;

// 这些是"载荷设计"的契约，不是实现细节：一旦被改回去，
// 首屏体积会悄悄翻倍、详情面板会变成空白，而功能测试仍然是绿的。

test("snapshot never embeds the static company introduction", () => {
  assert.equal(JSON.stringify(snapshot).includes('"introduction"'), false);
  const rebuilt = buildSnapshot({
    quotes: snapshot.securities,
    universe,
    profiles,
    ahPairs,
    generatedAt: snapshot.generatedAt,
    tradeDate: snapshot.tradeDate,
    marketStatus: "close",
    limit: 50,
  });
  assert.equal(JSON.stringify(rebuilt).includes('"introduction"'), false);
  assert.equal(rebuilt.rankings.turnover.length, 50);
  assert.equal(rebuilt.securities.length, snapshot.securities.length);
});

test("every security keeps a profile entry so the lazy introduction can resolve", () => {
  const missing = snapshot.securities.map((item) => item.code).filter((code) => !profiles[code]);
  assert.deepEqual(missing, []);
  const withText = snapshot.securities.filter((item) => (profiles[item.code]?.introduction ?? "").trim().length > 0);
  // 少量标的确实没有简介文本，页面会显示"暂无公司简介"，这是设计内的兜底。
  assert.ok(withText.length / snapshot.securities.length > 0.99, `only ${withText.length}/${snapshot.securities.length} have text`);
});

test("snapshot stays within its payload budget", () => {
  const bytes = Buffer.byteLength(JSON.stringify(snapshot, null, 2) + "\n");
  // 660 只证券的合理体量约 0.6MB。超过 0.9MB 说明又有长文本被内嵌回快照。
  assert.ok(bytes < 0.9 * 1048576, `snapshot is ${(bytes / 1048576).toFixed(2)} MB`);
});

test("the share image still renders from the slim snapshot", () => {
  const svg = buildShareImageSvg(snapshot);
  assert.equal((svg.match(/data-rank-row=/g) || []).length, 50);
  assert.match(svg, /总市值/);
});
