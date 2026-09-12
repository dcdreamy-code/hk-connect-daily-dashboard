import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  fetchEastmoneyAhPairs,
  fetchEastmoneyUniverseQuotes,
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
  }
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
