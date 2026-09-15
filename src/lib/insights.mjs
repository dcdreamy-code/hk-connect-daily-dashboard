// 榜单派生结论（今日观察文案）。页面与传播图共用同一份口径，
// 因此它必须独立于出图模块 —— 浏览器不应为了一个纯函数而载入 Node 侧渲染代码。
import { compactHkd, percent } from "./format.mjs";

export function numbers(items, key) {
  return items.map((item) => item[key]).filter(Number.isFinite);
}

export function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildDailyInsights(items) {
  if (items.length === 0) throw new Error("insights require a turnover ranking");
  const changes = numbers(items, "changePercent");
  const advancers = changes.filter((value) => value > 0).length;
  const decliners = changes.filter((value) => value < 0).length;
  const totalTurnover = items.reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const topTenTurnover = items.slice(0, 10).reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const concentration = totalTurnover ? topTenTurnover / totalTurnover * 100 : 0;
  const leader = items[0];
  const extremeUp = items.filter((item) => Number.isFinite(item.changePercent)).toSorted((left, right) => right.changePercent - left.changePercent)[0];
  const extremeDown = items.filter((item) => Number.isFinite(item.changePercent)).toSorted((left, right) => left.changePercent - right.changePercent)[0];
  const shortFocus = items.filter((item) => Number.isFinite(item.shortRatio)).toSorted((left, right) => right.shortRatio - left.shortRatio)[0] ?? null;
  const atHighs = items.filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.close) && item.close >= item.high52);
  const atLows = items.filter((item) => Number.isFinite(item.low52) && Number.isFinite(item.close) && item.close <= item.low52);
  const nearHighs = items.filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.close) && item.close >= item.high52 * 0.98 && item.close < item.high52);
  const nearLows = items.filter((item) => Number.isFinite(item.low52) && Number.isFinite(item.close) && item.close <= item.low52 * 1.02 && item.close > item.low52);
  const leaderDays = leader?.continuity?.top50Days;

  const names = (list) => list.slice(0, 2).map((item) => item.name).join("、");
  const standout = atHighs.length >= 1
    ? `${names(atHighs)}创 52 周新高`
    : atLows.length >= 1
      ? `${names(atLows)}创 52 周新低`
      : nearHighs.length >= 1
        ? `${names(nearHighs)}逼近 52 周高点`
        : nearLows.length >= 1
          ? `${names(nearLows)}逼近 52 周低点`
          : extremeUp
            ? `${extremeUp.name}领涨全场`
            : "";

  const headline = `Top 50 榜单 ${advancers} 涨 ${decliners} 跌${standout ? `；${standout}` : ""}。`;

  const bullets = [
    `成交集中度｜Top 10 占 Top 50 成交额 ${concentration.toFixed(1)}%`,
    `龙头观察｜${leader.name} 成交 ${compactHkd(leader.turnover)}港币居首${leaderDays ? `，连续 ${leaderDays} 日上榜` : ""}`,
    shortFocus && shortFocus.shortRatio >= 20
      ? `沽空与极值｜${extremeUp.name} ${percent(extremeUp.changePercent)} 领涨，${extremeDown.name} ${percent(extremeDown.changePercent)} 领跌；${shortFocus.name} 沽空比 ${percent(shortFocus.shortRatio, false)}`
      : `极值扫描｜${extremeUp.name} ${percent(extremeUp.changePercent)} 领涨，${extremeDown.name} ${percent(extremeDown.changePercent)} 领跌`,
  ];
  return { headline, bullets };
}
