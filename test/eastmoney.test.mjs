import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  fetchEastmoneyAhPairs,
  fetchEastmoneyShortSelling,
  fetchEastmoneyUniverseQuotes,
  fetchSouthboundFlow,
} from "../src/adapters/eastmoney.mjs";

const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/eastmoney-quotes.json", import.meta.url)));

test("fetchEastmoneyUniverseQuotes retries transient failures and rejects malformed responses", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary failure");
    if (calls === 2) return new Response(JSON.stringify({ rc: 0, data: {} }), { status: 200 });
    return new Response(JSON.stringify(fixture), { status: 200 });
  };
  const quotes = await fetchEastmoneyUniverseQuotes(["00001"], { fetchImpl, retries: 2, retryDelayMs: 0 });
  assert.equal(calls, 3);
  assert.equal(quotes.length, 4);
  assert.equal(quotes[0].name, "长和");
  await assert.rejects(
    () => fetchEastmoneyUniverseQuotes(["00001"], { fetchImpl: async () => new Response(JSON.stringify({ rc: 0, data: {} }), { status: 200 }), retries: 0 }),
    /missing data.diff/,
  );
});

test("fetchEastmoneyUniverseQuotes batches requested securities", async () => {
  const requestedBatches = [];
  const fields = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const ids = parsed.searchParams.get("secids").split(",");
    requestedBatches.push(ids);
    fields.push(parsed.searchParams.get("fields"));
    const diff = ids.map((id, index) => ({
      f12: id.split(".")[1],
      f14: `Stock ${index}`,
      f2: 10,
      f3: 1,
      f6: 100,
      f124: 1788969600,
    }));
    return new Response(JSON.stringify({ rc: 0, data: { total: diff.length, diff } }), { status: 200 });
  };
  const codes = ["00001", "00002", "00003", "00004", "00005"];
  const quotes = await fetchEastmoneyUniverseQuotes(codes, { fetchImpl, batchSize: 2, retries: 0 });
  assert.deepEqual(requestedBatches.map((batch) => batch.length), [2, 2, 1]);
  assert.equal(quotes.length, 5);
  assert.equal(quotes[4].code, "00005");
  for (const batchFields of fields) {
    assert.equal(batchFields.split(",").includes("f62"), true);
    assert.equal(batchFields.split(",").includes("f184"), true);
    assert.equal(batchFields.split(",").includes("f100"), true);
    assert.equal(batchFields.split(",").includes("f9"), true);
    assert.equal(batchFields.split(",").includes("f23"), true);
  }
});

test("fetchEastmoneyShortSelling pages the daily report and keys by stock code", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requested.push({ page: parsed.searchParams.get("pageNumber"), filter: parsed.searchParams.get("filter") });
    const page = Number(parsed.searchParams.get("pageNumber"));
    const diff = page === 1
      ? [{ SECUCODE: "09988.HK", SHORT_SELLING_AMT: 1234846000, SHORT_SELLING_RATIO: 20.64 }, { SECUCODE: "2513", SHORT_SELLING_AMT: 100, SHORT_SELLING_RATIO: 5 }]
      : [{ SECUCODE: "01810.HK", SHORT_SELLING_AMT: 926145628, SHORT_SELLING_RATIO: 31.18 }];
    return new Response(JSON.stringify({ result: { pages: 2, data: diff } }), { status: 200 });
  };
  const shorts = await fetchEastmoneyShortSelling({ tradeDate: "2026-09-11", fetchImpl, retries: 0 });
  assert.deepEqual(requested.map((item) => item.page), ["1", "2"]);
  assert.match(requested[0].filter, /2026-09-11/);
  assert.equal(shorts["09988"].shortRatio, 20.64);
  assert.equal("02513" in shorts, false);
  assert.equal(shorts["01810"].shortRatio, 31.18);
});

test("fetchSouthboundFlow sums the two southbound legs in Hong Kong dollars", async () => {
  const seenTypes = [];
  const fetchImpl = async (url) => {
    const mutualType = new URL(url).searchParams.get("filter").match(/"(\d{3})"/)[1];
    seenTypes.push(mutualType);
    const net = mutualType === "002" ? 3191.91 : 1239.11;
    const deal = mutualType === "002" ? 57310.65 : 38182.05;
    return new Response(JSON.stringify({
      result: { data: [{ TRADE_DATE: "2026-09-11 00:00:00", NET_DEAL_AMT: net, DEAL_AMT: deal }] },
    }), { status: 200 });
  };
  const flow = await fetchSouthboundFlow({ fetchImpl, retries: 0 });
  assert.deepEqual(seenTypes, ["002", "004"]);
  assert.equal(flow.tradeDate, "2026-09-11");
  assert.equal(flow.netBuyHkd, 4431020000);
  assert.equal(flow.turnoverHkd, 95492700000);
});

test("fetchSouthboundFlow throws when net buying is not disclosed", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    result: { data: [{ TRADE_DATE: "2026-09-11 00:00:00", NET_DEAL_AMT: null, DEAL_AMT: 100 }] },
  }), { status: 200 });
  await assert.rejects(() => fetchSouthboundFlow({ fetchImpl, retries: 0 }), /not disclosed/);
});

test("fetchEastmoneyAhPairs maps H codes to A-share metadata", async () => {
  const payload = {
    rc: 0,
    data: {
      total: 2,
      diff: [
        { f12: "01398", f191: "601398", f186: 7.61, f187: 0.86, f3: 1.29, f188: 12.34 },
        { f12: "03750", f191: "300750", f186: 561.5, f187: -0.09, f3: 0.5, f188: -4.2 },
      ],
    },
  };
  const fetchImpl = async () => new Response(JSON.stringify(payload), { status: 200 });
  const pairs = await fetchEastmoneyAhPairs({ fetchImpl, retries: 0 });
  assert.deepEqual(pairs["01398"], {
    aCode: "601398",
    aPrice: 7.61,
    aChangePercent: 0.86,
    hChangePercent: 1.29,
    premiumPercent: 12.34,
  });
  assert.equal(pairs["03750"].aCode, "300750");
});
