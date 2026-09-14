// 腾讯行情批量接口:单次请求约 60 只,直接返回 52 周最高/最低字段,无需逐股拉取周 K 线
const ENDPOINT = "https://qt.gtimg.cn/q=";
const HIGH52_INDEX = 48;
const LOW52_INDEX = 49;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchTencent52wRange(codes, {
  fetchImpl = fetch,
  timeoutMs = 15000,
  retries = 1,
  retryDelayMs = 800,
  batchSize = 60,
} = {}) {
  const rangeByCode = {};
  for (let start = 0; start < codes.length; start += batchSize) {
    const batch = codes.slice(start, start + batchSize);
    const url = ENDPOINT + batch.map((code) => `hk${code}`).join(",");
    let text = null;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: { Accept: "text/plain,*/*" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Tencent returned HTTP ${response.status}`);
        text = new TextDecoder("gbk").decode(await response.arrayBuffer());
        if (text.includes("~")) break;
        lastError = new Error("empty tencent payload (possibly rate limited)");
        text = null;
      } catch (error) {
        lastError = error;
      }
      if (attempt < retries) await wait(retryDelayMs);
    }
    if (text === null) {
      console.warn(`52w range batch skipped: ${lastError?.message ?? "unknown error"}`);
      continue;
    }
    for (const match of text.matchAll(/v_hk(\d{5})="([^"]*)"/g)) {
      const fields = match[2].split("~");
      const high52 = Number(fields[HIGH52_INDEX]);
      const low52 = Number(fields[LOW52_INDEX]);
      if (Number.isFinite(high52) && Number.isFinite(low52) && high52 > 0 && low52 > 0) {
        rangeByCode[match[1]] = { high52, low52 };
      }
    }
  }
  return rangeByCode;
}
