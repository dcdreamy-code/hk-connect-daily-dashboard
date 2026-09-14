import { formatPercent } from "./format.mjs";

function toYi(value) {
  if (!Number.isFinite(value)) return "--";
  return (value / 100_000_000).toFixed(2);
}

function compact(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(Math.round(value));
}

function hkDateParts(iso) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return { monthDay: `${get("month")}月${get("day")}日`, hhmm: `${get("hour")}:${get("minute")}` };
}

function ticker(item) {
  return `$${item.name}(${item.code})$`;
}

function changeOf(item) {
  return formatPercent(item.changePercent);
}

function topMovers(items, key, direction, count) {
  return [...items]
    .filter((item) => Number.isFinite(item[key]))
    .sort((left, right) => direction * (right[key] - left[key]))
    .slice(0, count);
}

function newExtreme(items) {
  const highs = items
    .filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.close) && item.close >= item.high52 * 0.98)
    .sort((left, right) => right.close / right.high52 - left.close / left.high52);
  const lows = items
    .filter((item) => Number.isFinite(item.low52) && Number.isFinite(item.close) && item.close <= item.low52 * 1.02)
    .sort((left, right) => left.close / left.low52 - right.close / right.low52);
  return { high: highs[0] ?? null, low: lows[0] ?? null };
}

export function buildDailySummary(snapshot) {
  const top = snapshot.rankings?.turnover ?? [];
  if (top.length === 0) throw new Error("summary requires turnover ranking");
  const market = snapshot.market ?? {};
  const { monthDay, hhmm } = hkDateParts(snapshot.generatedAt);

  const turnoverTop = top.map((item) => item.turnover ?? 0);
  const top50Total = turnoverTop.reduce((sum, value) => sum + value, 0);
  const top10Total = turnoverTop.slice(0, 10).reduce((sum, value) => sum + value, 0);
  const concentration = top50Total > 0 ? (top10Total / top50Total) * 100 : 0;
  const changes = top.map((item) => item.changePercent).filter(Number.isFinite);
  const top50Up = changes.filter((value) => value > 0).length;
  const top50Down = changes.filter((value) => value < 0).length;
  const avgChange = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;

  const southboundNote = market.southboundAsOf && market.southboundAsOf !== snapshot.tradeDate
    ? `（${market.southboundAsOf.slice(5).replace("-", "/")}值）`
    : "";

  const top3 = top.slice(0, 3);
  const top10Gainers = topMovers(top.slice(0, 10), "changePercent", 1, 3);
  const top10Losers = topMovers(top.slice(0, 10), "changePercent", -1, 3);
  const highTurnover = topMovers(top, "turnoverRate", 1, 1)[0] ?? null;
  const { high: newHigh, low: newLow } = newExtreme(top);
  const extremeUp = topMovers(top, "changePercent", 1, 1)[0] ?? null;
  const extremeDown = topMovers(top, "changePercent", -1, 1)[0] ?? null;

  const lines = [];
  lines.push(`【港股通资金雷达｜${monthDay} 数据盘点】`);
  lines.push("");
  lines.push("一、 大盘整体数据概览");
  lines.push(`• 资金进出：南向资金今日单日净买入 ${Number.isFinite(market.southboundNetBuy) ? toYi(market.southboundNetBuy) : "--"} 亿港币${southboundNote}。`);
  lines.push(`• 全场交投：港股通总成交额 ${toYi(market.turnover)} 亿港币。`);
  lines.push(`• 涨跌结构：港股通全市场 ${market.advancers ?? "--"} 家上涨、${market.decliners ?? "--"} 家下跌；成交额 Top 50 榜单中 ${top50Up} 涨、${top50Down} 跌（平均涨跌幅 ${formatPercent(avgChange)}）。`);
  lines.push(`• 集中度：Top 10 标的成交额占 Top 50 总成交额的 ${concentration.toFixed(1)}%。`);
  lines.push("");
  lines.push("二、 头部标的与成交分布（Top 10 数据）");
  lines.push("1. 成交额居前标的：");
  top3.forEach((item, index) => {
    const suffix = index === 0 ? "（榜首）" : "";
    lines.push(`   • ${ticker(item)}：成交额 ${toYi(item.turnover)} 亿港币${suffix}，涨跌幅 ${changeOf(item)}。`);
  });
  lines.push("2. 成交额Top 10表现分布：");
  if (top10Gainers.length > 0) {
    lines.push(`   • 涨幅前三：${top10Gainers.map((item) => `${ticker(item)}（${changeOf(item)}）`).join("、")}。`);
  }
  if (top10Losers.length > 0) {
    lines.push(`   • 跌幅前三：${top10Losers.map((item) => `${ticker(item)}（${changeOf(item)}）`).join("、")}。`);
  }
  lines.push("");
  lines.push("三、 榜单异动指标监测（Top 50 范围）");
  if (highTurnover) {
    lines.push(`• 高换手标的：${ticker(highTurnover)} 换手率达 ${highTurnover.turnoverRate.toFixed(2)}%，单日成交 ${toYi(highTurnover.turnover)} 亿港币，涨跌幅 ${changeOf(highTurnover)}。`);
  }
  const extremeParts = [];
  if (newHigh) extremeParts.push(`${ticker(newHigh)} 股价创阶段新高（涨跌幅 ${changeOf(newHigh)}）`);
  if (newLow) extremeParts.push(`${ticker(newLow)} 创阶段新低（涨跌幅 ${changeOf(newLow)}）`);
  lines.push(extremeParts.length > 0 ? `• 新高/新低纪录：${extremeParts.join("；")}。` : "• 新高/新低纪录：今日 Top 50 无个股触及 52 周极值。");
  if (extremeUp && extremeDown) {
    lines.push(`• 最大涨跌极值：全榜最高涨幅为 ${ticker(extremeUp)}（${changeOf(extremeUp)}），最大跌幅为 ${ticker(extremeDown)}（${changeOf(extremeDown)}）。`);
  }
  lines.push("");
  lines.push(`数据来源：港股通收盘快照（截至 ${hhmm}）`);
  lines.push(top3.map(ticker).join(" "));
  return lines.join("\n");
}
