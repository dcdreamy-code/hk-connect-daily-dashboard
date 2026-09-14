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

function nameOf(item) {
  return item.name;
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

  const first = top[0];
  const top10 = top.slice(0, 10);
  const gainers = sortedBy(top10, "changePercent", 1).filter((item) => item.changePercent > 0).slice(0, 2);
  const losers = sortedBy(top10, "changePercent", -1).filter((item) => item.changePercent < 0).slice(0, 2);
  const turnoverFocus = sortedBy(top, "turnoverRate", 1)[0] ?? null;
  const extremeUp = sortedBy(top, "changePercent", 1)[0] ?? null;
  const extremeDown = sortedBy(top, "changePercent", -1)[0] ?? null;
  const newHigh = sortedBy(top.filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.high) && item.high >= item.high52), "turnover", 1)[0] ?? null;
  const shortFocus = sortedBy(top.filter((item) => Number.isFinite(item.shortRatio) && item.shortRatio >= 20), "shortRatio", 1)[0] ?? null;

  // 风格化开头句(按当日盘面特征选择)
  const southboundAbs = Math.abs(market.southboundNetBuy / 100_000_000).toFixed(2);
  const southboundNetDesc = Number.isFinite(market.southboundNetBuy)
    ? (market.southboundNetBuy >= 0 ? `南向资金净流入 ${southboundAbs} 亿` : `南向资金净流出 ${southboundAbs} 亿`)
    : "";
  const openings = {
    polarized: `资金高度集中的交易日：Top 10 标的合计占去全榜 ${concentration.toFixed(1)}% 的成交。`,
    rotation: `盘面异动不少：单日换手率最高升至 ${Math.max(0, ...top.map((item) => item.turnoverRate ?? 0)).toFixed(2)}%。`,
    brief: `大市窄幅波动，活跃股涨跌互现。`,
  };
  const briefAlternate = `${monthDay}港股通收盘快照：${southboundNetDesc}，Top 50 榜单平均涨跌幅为 ${formatPercent(avgChange)}。`;
  const opening = style === "brief" && rotate === 1 ? briefAlternate : openings[style];

  // 大盘段(开头已提及南向时不再重复)
  const southAsOf = market.southboundAsOf && market.southboundAsOf !== snapshot.tradeDate
    ? `（${market.southboundAsOf.slice(5).replace("-", "/")}值）`
    : "";
  const southLine = opening.includes("南向")
    ? ""
    : `${Number.isFinite(market.southboundNetBuy) ? southboundNetDesc.replace("南向资金", "南向资金全天") : "南向资金数据暂缺"}${southAsOf}；`;
  const poolLine = `港股通标的今日合计成交 ${toYi(market.turnover)} 亿，其中 ${market.advancers} 家上涨、${market.decliners} 家下跌。`;
  const t50Line = `成交额 Top 50 榜单里，${up} 家收涨、${down} 家收跌，平均涨跌幅 ${formatPercent(avgChange)}；Top 10 合计占去 ${concentration.toFixed(1)}% 的成交，成交继续向头部聚集。`;

  // 头部成交段(前三名,句式变化避免机械感)
  const closeDesc = (item) => {
    if (!Number.isFinite(item.changePercent) || item.changePercent === 0) return "平盘报收";
    return item.changePercent > 0 ? `收涨 ${item.changePercent.toFixed(2)}%` : `收跌 ${Math.abs(item.changePercent).toFixed(2)}%`;
  };
  let headPara = `${nameOf(first)}以 ${toYi(first.turnover)} 亿成交领跑全榜，${closeDesc(first)}`;
  if (top[1]) headPara += `；${nameOf(top[1])}成交 ${toYi(top[1].turnover)} 亿紧随其后，${closeDesc(top[1])}`;
  if (top[2]) headPara += `；${nameOf(top[2])}成交 ${toYi(top[2].turnover)} 亿位列第三，${closeDesc(top[2])}`;
  headPara += "。";

  // 消息面速览(仅统计焦点个股当天标题含其名称的新闻)
  const newsItems = top.filter((item) => Array.isArray(item.news) && item.news.length > 0).slice(0, 4);
  const newsPara = newsItems.length > 0
    ? ["消息面速览", ...newsItems.map((item) => {
        const article = item.news[0];
        const title = article.title.length > 34 ? `${article.title.slice(0, 34)}…` : article.title;
        return `• ${nameOf(item)}：${title}（${article.mediaName}）`;
      })].join("\n")
    : "";

  // 焦点与异动段
  const focusParts = [];
  if (shortFocus) {
    focusParts.push(`沽空方面，${nameOf(shortFocus)}沽空比率升至 ${shortFocus.shortRatio.toFixed(2)}%，空头力度在各标的之中最为突出`);
  }
  focusParts.push(`${nameOf(extremeUp)}上涨 ${Math.abs(extremeUp.changePercent).toFixed(2)}% 领涨，${nameOf(extremeDown)}下跌 ${Math.abs(extremeDown.changePercent).toFixed(2)}% 领跌`);
  if (newHigh) {
    focusParts.push(`${nameOf(newHigh)}盘中触及 52 周高点`);
  }
  const focusSentence = focusParts.join("；") + "。";

  const blocks = [
    `${column} | ${monthDay}`,
    "",
    opening,
    "",
    southLine + poolLine + t50Line,
    "",
    headPara,
    "",
    focusSentence,
  ];
  if (newsPara) blocks.push("", newsPara);
  blocks.push("", `数据来源：港股通收盘正式快照（截至 ${hhmm}）`);
  return blocks.filter((block) => block !== "").join("\n\n");
}