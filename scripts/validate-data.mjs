import fs from "node:fs/promises";

const filePath = process.argv[2];
if (!filePath) throw new Error("usage: node scripts/validate-data.mjs <snapshot.json>");
const snapshot = JSON.parse(await fs.readFile(filePath, "utf8"));

const errors = [];
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.tradeDate ?? "")) errors.push("invalid tradeDate");
if (!Number.isFinite(Date.parse(snapshot.generatedAt))) errors.push("invalid generatedAt");
if (!snapshot.coverage || snapshot.coverage.ratio < 0.8) errors.push("coverage below 80%");
if (!Array.isArray(snapshot.securities) || snapshot.securities.length !== snapshot.coverage?.matched) {
  errors.push("full securities collection does not match coverage");
}
for (const key of ["turnover", "gainers", "losers"]) {
  const ranking = snapshot.rankings?.[key];
  if (!Array.isArray(ranking) || ranking.length < 1 || ranking.length > 50) {
    errors.push(`invalid ${key} ranking length`);
    continue;
  }
  if (ranking.some((item) => !/^\d{5}$/.test(item.code) || !item.name)) {
    errors.push(`invalid ${key} ranking item`);
  }
  if (ranking.some((item) => !Object.hasOwn(item, "marketCap") || !Object.hasOwn(item, "turnoverRate") || !Object.hasOwn(item, "amplitude"))) {
    errors.push(`missing ${key} market fields`);
  }
  if (ranking.some((item) => item.ah !== null && !/^\d{6}$/.test(item.ah?.aCode ?? ""))) {
    errors.push(`invalid ${key} AH metadata`);
  }
}

if (errors.length) throw new Error(errors.join("; "));
console.log(`Valid snapshot for ${snapshot.tradeDate} (${snapshot.coverage.matched}/${snapshot.coverage.universe}).`);
