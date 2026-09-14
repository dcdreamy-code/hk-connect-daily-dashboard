import { formatPercent } from "./format.mjs";

// 风格判定阈值(客观、可复核):
//   极化(polarized):Top10 成交集中度 ≥ 50%,或 Top50 涨跌家数差 ≥ 15
//   异动(rotation):不满足极化,且 Top50 内最高换手率 ≥ 15%
//   快报(brief):其余震荡交易日
const POLARIZED_CONCENTRATION = 50;
const POLARIZED_SPREAD = 15;
const ROTATION_TURNOVER_RATE = 15;

const STYLES = {
  polarized: {
    columns: ["【港股通数据观察】", "【今日南向资金账本】"],
    emoji: ["📊", "🏆", "🔍"],
  },
  rotation: {
    columns: ["【港股通每日异动雷达】", "【今日港股通交投快报】"],
    emoji: ["📡", "🔥", "🧭"],
  },
  brief: {
    columns: ["【港股通收盘数据播报】", "【港股通资金快照】"],
    emoji: ["📊", "🗂️", "🔎"],
  },
};

function toYi(value) {
  if (!Number.isFinite(value)) return "--";
  return (value / 100_000_000).toFixed(2);
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

function sortedBy(items, key, direction) {
  return [...items]
    .filter((item) => Number.isFinite(item[key]))
    .sort((left, right) => direction * (right[key] - left[key]));
}

function southboundPhrase(net) {
  if (!Number.isFinite(net)) return { text: "--" };
  const amount = Math.abs(net / 100_000_000).toFixed(2);
  return { text: net >= 0 ? `净买入 ${amount}` : `净卖出 ${amount}` };
}

export function pickDailyStyle(snapshot) {
  const top = snapshot.rankings?.turnover ?? [];
  const changes = top.map((item) => item.changePercent).filter(Number.isFinite);
  const up = changes.filter((value) => value > 0).length;
  const down = changes.filter((value) => value < 0).length;
  const total = top.reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const top10 = top.slice(0, 10).reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const concentration = total > 0 ? (top10 / total) * 100 : 0;
  const maxTurnoverRate = Math.max(0, ...top.map((item) => item.turnoverRate ?? 0));
  if (concentration >= POLARIZED_CONCENTRATION || Math.abs(up - down) >= POLARIZED_SPREAD) return "polarized";
  if (maxTurnoverRate >= ROTATION_TURNOVER_RATE) return "rotation";
  return "brief";
}

export function buildDailySummary(snapshot) {
  const top = snapshot.rankings?.turnover ?? [];
  if (top.length === 0) throw new Error("summary requires turnover ranking");
  const market = snapshot.market ?? {};
  const { monthDay, hhmm } = hkDateParts(snapshot.generatedAt);

  const changes = top.map((item) => item.changePercent).filter(Number.isFinite);
  const up = changes.filter((value) => value > 0).length;
  const down = changes.filter((value) => value < 0).length;
  const avgChange = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
  const turnoverTotal = top.reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const top10Total = top.slice(0, 10).reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const concentration = turnoverTotal > 0 ? (top10Total / turnoverTotal) * 100 : 0;
  const style = pickDailyStyle(snapshot);
  const styleConfig = STYLES[style];
  const rotate = Number(snapshot.tradeDate?.slice(8) ?? 1) % 2;
  const column = styleConfig.columns[rotate];
  const emoji = styleConfig.emoji;

  const south = southboundPhrase(market.southboundNetBuy);
  const southAsOf = market.southboundAsOf && market.southboundAsOf !== snapshot.tradeDate
    ? `（${market.southboundAsOf.slice(5).replace("-", "/")}值）`
    : "";
  const southboundText = `${south.text} 亿港币${southAsOf}`;
  const southboundNetDesc = market.southboundNetBuy >= 0
    ? `净流入 ${southboundAbs(market.southboundNetBuy)} 亿`
    : `净流出 ${southboundAbs(market.southboundNetBuy)} 亿`;

  function southboundAbs(net) {
    return (Math.abs(net) / 100_000_000).toFixed(2);
  }

  const first = top[0];
  const top10 = top.slice(0, 10);
  const gainers = sortedBy(top10, "changePercent", 1).filter((item) => item.changePercent > 0).slice(0, 2);
  const losers = sortedBy(top10, "changePercent", -1).filter((item) => item.changePercent < 0).slice(0, 2);
  const turnoverFocus = sortedBy(top, "turnoverRate", 1)[0] ?? null;
  const extremeUp = sortedBy(top, "changePercent", 1)[0] ?? null;
  const extremeDown = sortedBy(top, "changePercent", -1)[0] ?? null;
  const newHighs = sortedBy(top.filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.close) && item.close >= item.high52 * 0.98), "turnover", 1);
  const newHigh = newHighs[0] ?? null;

  const openings = {
    polarized: market.southboundNetBuy >= 0
      ? `今天港股通数据出炉，南向资金单日扫货 ${southboundAbs(market.southboundNetBuy)} 亿，但资金集中度达到了 ${concentration.toFixed(1)}%，头部博弈迹象明显。`
      : `今天港股通数据出炉，南向资金单日净卖出 ${southboundAbs(market.southboundNetBuy)} 亿，资金集中度达到 ${concentration.toFixed(1)}%，头部博弈迹象明显。`,
    rotation: `从今天港股通 Top 50 榜单来看，整体呈现 ${up} 涨 ${down} 跌的格局，南向资金${southboundNetDesc}。`,
    brief: `今日港股通交投总额 ${toYi(market.turnover)} 亿，活跃股整体表现如下：`,
  };
  const briefAlternate = `${monthDay}港股通收盘快照：南向资金${south.text} 亿港币，Top 50 榜单平均涨跌幅为 ${formatPercent(avgChange)}。`;
  const opening = style === "brief" && rotate === 0 ? briefAlternate : openings[style];

  const lines = [];
  lines.push(`${column} | ${monthDay}`);
  lines.push("");
  lines.push(opening);
  lines.push("");
  lines.push(`${emoji[0]} 整体交投概览`);
  lines.push(`• 南向资金：${southboundText}`);
  lines.push(`• 港股通标的总成交：${toYi(market.turnover)} 亿港币`);
  lines.push(`• Top 50 涨跌分布：${up} 涨 / ${down} 跌（均值 ${formatPercent(avgChange)}）`);
  lines.push(`• 集中度：Top 10 成交额占比 ${concentration.toFixed(1)}%`);
  lines.push("");
  lines.push(`${emoji[1]} 头部成交分布（Top 10 数据）`);
  lines.push(`• 成交第一：${ticker(first)} 成交 ${toYi(first.turnover)} 亿（涨跌幅 ${changeOf(first)}）`);
  if (gainers.length > 0) {
    lines.push(`• 表现较强：${gainers.map((item) => `${ticker(item)}（${changeOf(item)}）`).join("、")}`);
  }
  if (losers.length > 0) {
    lines.push(`• 调整回调：${losers.map((item) => `${ticker(item)}（${changeOf(item)}）`).join("、")}`);
  }
  lines.push("");
  lines.push(`${emoji[2]} 榜单焦点与异动（Top 50 监测）`);
  if (turnoverFocus) {
    lines.push(`• 换手率焦点：${ticker(turnoverFocus)} 换手率 ${turnoverFocus.turnoverRate.toFixed(2)}%，成交 ${toYi(turnoverFocus.turnover)} 亿，收 ${changeOf(turnoverFocus)}`);
  }
  if (extremeUp && extremeDown) {
    lines.push(`• 极值分布：最高涨幅 ${ticker(extremeUp)}（${changeOf(extremeUp)}），最大跌幅 ${ticker(extremeDown)}（${changeOf(extremeDown)}）`);
  }
  if (newHigh) {
    lines.push(`• 破高动态：${ticker(newHigh)} 今日盘中创阶段新高`);
  }
  lines.push("");
  lines.push(`数据来源：港股通收盘正式快照（截至 ${hhmm}）`);
  lines.push(top.slice(0, 3).map(ticker).join(" "));
  return lines.join("\n");
}
