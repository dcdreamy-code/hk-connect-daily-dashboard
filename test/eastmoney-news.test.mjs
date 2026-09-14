import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { fetchEastmoneyStockNews } from "../src/adapters/eastmoney.mjs";

const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/eastmoney-news.json", import.meta.url), "utf8"));

test("fetchEastmoneyStockNews unwraps jsonp, filters by date and trims fields", async () => {
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = new URL(url);
    return new Response(`cb(${JSON.stringify(fixture)});`, { status: 200 });
  };
  const articles = await fetchEastmoneyStockNews({
    keyword: "智谱",
    date: "2026-09-14",
    limit: 2,
    fetchImpl,
    retries: 0,
  });
  assert.match(decodeURIComponent(requestedUrl.searchParams.get("param")), /智谱/);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "大模型重压之下：DeepSeek改口、Kimi辟谣、智谱融资");
  assert.equal(articles[0].mediaName, "北京商报");
  assert.equal(articles[0].url, "http://finance.eastmoney.com/a/202609143873667192.html");
});

test("fetchEastmoneyStockNews drops articles from other dates", async () => {
  const fetchImpl = async () => new Response(JSON.stringify(fixture), { status: 200 });
  const articles = await fetchEastmoneyStockNews({ keyword: "智谱", date: "2026-09-10", fetchImpl, retries: 0 });
  assert.equal(articles.length, 0);
});

test("fetchEastmoneyStockNews throws after retries when the search returns nothing", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ result: { cmsArticleWebOld: [] } }), { status: 200 });
  };
  await assert.rejects(
    () => fetchEastmoneyStockNews({ keyword: "智谱", date: "2026-09-14", fetchImpl, retries: 1, retryDelayMs: 0 }),
    /news search failed/,
  );
  assert.equal(calls, 2);
});
