import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { fetchTencent52wRange } from "../src/adapters/tencent.mjs";

function gbkPayload(batches) {
  // batches: Map<hkCode, [high52, low52]> — 名字用 ASCII 占位,数值字段与线上一致
  const body = [...batches.entries()]
    .map(([code, [high, low]]) => {
      const fields = new Array(60).fill("");
      fields[0] = "100";
      fields[2] = code;
      fields[3] = "430.600";
      fields[48] = high;
      fields[49] = low;
      return `v_hk${code}="${fields.join("~")}";`;
    })
    .join("\n");
  return Buffer.from(body, "latin1");
}

test("fetchTencent52wRange batches codes and extracts the 52-week fields", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const list = new URL(url).pathname.replace("/q=", "");
    requested.push(list.split(",").length);
    const codes = list.split(",");
    const payload = new Map();
    codes.forEach((hkCode, index) => {
      const code = hkCode.replace("hk", "");
      payload.set(code, [String(100 + index), String(50 + index)]);
    });
    return new Response(gbkPayload(payload), { status: 200 });
  };
  const codes = ["00700", "09988", "02513"];
  const ranges = await fetchTencent52wRange(codes, { fetchImpl, retries: 0, batchSize: 2 });
  assert.deepEqual(requested, [2, 1]);
  assert.deepEqual(ranges["00700"], { high52: 100, low52: 50 });
  assert.deepEqual(ranges["09988"], { high52: 101, low52: 51 });
  assert.deepEqual(ranges["02513"], { high52: 100, low52: 50 });
});

test("fetchTencent52wRange retries rate limited batches and skips malformed rows", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const code = new URL(url).pathname.replace("/q=hk", "");
    if (calls === 1) return new Response("rate limited", { status: 200 });
    if (calls === 2) {
      return new Response(gbkPayload(new Map([[code, [677.7, 411]]])), { status: 200 });
    }
    return new Response(gbkPayload(new Map([["x", ["bad", "bad"]]])), { status: 200 });
  };
  const ranges = await fetchTencent52wRange(["00700"], { fetchImpl, retries: 2, retryDelayMs: 0 });
  assert.equal(calls, 2);
  assert.deepEqual(ranges["00700"], { high52: 677.7, low52: 411 });
});

test("fetchTencent52wRange fixture matches the live payload shape", async () => {
  const payload = await fs.readFile(new URL("./fixtures/tencent-quotes.txt", import.meta.url), "utf8");
  const fields = payload.split("~");
  assert.equal(fields[2], "00700");
  assert.equal(Number(fields[48]), 677.7);
  assert.equal(Number(fields[49]), 411);
});
