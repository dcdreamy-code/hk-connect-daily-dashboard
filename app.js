const metricCopy = {
  turnover: "成交额",
  changePercent: "涨跌幅",
  marketCap: "总市值",
  turnoverRate: "换手率",
};

export function formatSignedHkd(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatHkd(Math.abs(value))}`;
}

export function formatRate(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

export function formatHkd(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function turnoverShare(value, leaderValue) {
  if (!Number.isFinite(value) || !Number.isFinite(leaderValue) || leaderValue <= 0) return 0;
  return Math.min(100, Math.max(0, value / leaderValue * 100));
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "--";
  return value >= 100 ? value.toFixed(1) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return "--";
  return `${formatHkd(value)}股`;
}

export function selectRanking(rankings, mode) {
  return rankings?.[mode] ?? rankings?.turnover ?? [];
}

export function sortSecurities(items, metric, direction = "desc", limit = 50) {
  const factor = direction === "asc" ? 1 : -1;
  return items.toSorted((left, right) => {
    const leftValue = left[metric];
    const rightValue = right[metric];
    const leftMissing = !Number.isFinite(leftValue);
    const rightMissing = !Number.isFinite(rightValue);
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing && leftValue !== rightValue) return factor * (leftValue - rightValue);
    return left.code.localeCompare(right.code);
  }).slice(0, limit);
}

export function filterRanking(items, query) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return items;
  return items.filter((item) => `${item.code} ${item.name}`.toLocaleLowerCase("zh-CN").includes(normalized));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeRanking(items) {
  const turnovers = items.map((item) => item.turnover).filter(Number.isFinite);
  const marketCaps = items.map((item) => item.marketCap).filter(Number.isFinite);
  const changes = items.map((item) => item.changePercent).filter(Number.isFinite);
  return {
    averageTurnover: average(turnovers),
    medianTurnover: median(turnovers),
    averageMarketCap: average(marketCaps),
    medianMarketCap: median(marketCaps),
    ahCount: items.filter((item) => item.ah?.aCode).length,
    averageChangePercent: average(changes),
    medianChangePercent: median(changes),
    advancers: changes.filter((value) => value > 0).length,
    decliners: changes.filter((value) => value < 0).length,
    unchanged: changes.filter((value) => value === 0).length,
    maxChangePercent: changes.length ? Math.max(...changes) : null,
    minChangePercent: changes.length ? Math.min(...changes) : null,
  };
}

export function xueqiuUrl(code) {
  return `https://xueqiu.com/S/${encodeURIComponent(normalizeCode(code))}`;
}

export function isNewerSnapshot(current, candidate) {
  const candidateTime = Date.parse(candidate?.generatedAt);
  if (!Number.isFinite(candidateTime)) return false;
  const currentTime = Date.parse(current?.generatedAt);
  return !Number.isFinite(currentTime) || candidateTime > currentTime;
}

function trendClass(value) {
  return value > 0 ? "up" : value < 0 ? "down" : "";
}

function appendCell(row, text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

export function profitabilityCounts(items) {
  let profitable = 0;
  let losing = 0;
  for (const item of items) {
    if (!Number.isFinite(item.peTtm)) continue;
    if (item.peTtm > 0) profitable += 1;
    else if (item.peTtm < 0) losing += 1;
  }
  return { profitable, losing };
}

export function rangePosition(close, high52, low52) {
  if (![close, high52, low52].every(Number.isFinite) || high52 <= low52) return null;
  return Math.min(100, Math.max(0, (close - low52) / (high52 - low52) * 100));
}

function securityCell(row, item, showContinuity) {
  const cell = document.createElement("td");
  cell.className = "security";
  const link = document.createElement("a");
  link.href = xueqiuUrl(item.code);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${item.name} ${item.code}.HK，打开雪球行情`);
  link.addEventListener("click", (event) => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
  });
  const nameLine = document.createElement("div");
  nameLine.className = "security-name";
  const name = document.createElement("strong");
  name.textContent = item.name;
  nameLine.append(name);
  if (item.ah) {
    const badge = document.createElement("span");
    badge.className = "ah-badge";
    badge.textContent = "AH";
    badge.title = `A 股 ${item.ah.aCode}`;
    nameLine.append(badge);
  }
  if (showContinuity && item.continuity) {
    const chip = document.createElement("span");
    chip.className = `streak-chip${item.continuity.isNew ? " is-new" : ""}`;
    chip.textContent = item.continuity.isNew ? "新进" : `连${item.continuity.top50Days}日`;
    chip.title = item.continuity.isNew
      ? "上一交易日未进入成交额 Top 50"
      : `连续 ${item.continuity.top50Days} 个交易日位于成交额 Top 50`;
    nameLine.append(chip);
  }
  if (Number.isFinite(item.peTtm) && item.peTtm < 0) {
    const badge = document.createElement("span");
    badge.className = "loss-badge";
    badge.textContent = "亏";
    badge.title = `TTM 市盈率 ${item.peTtm.toFixed(1)},公司近 12 个月亏损`;
    nameLine.append(badge);
  }
  if (Number.isFinite(item.shortRatio) && item.shortRatio >= 30) {
    const badge = document.createElement("span");
    badge.className = "short-badge";
    badge.textContent = "沽空";
    badge.title = `沽空比率 ${item.shortRatio.toFixed(1)}%,显著高于港股大中型股 15%-30% 的常态区间`;
    nameLine.append(badge);
  }
  if ([item.close, item.high52].every(Number.isFinite) && item.close >= item.high52 * 0.98) {
    const badge = document.createElement("span");
    badge.className = "newhigh-badge";
    badge.textContent = "新高";
    badge.title = `收盘价距 52 周最高 ${formatPrice(item.high52)} 不足 2%`;
    nameLine.append(badge);
  } else if ([item.close, item.low52].every(Number.isFinite) && item.close <= item.low52 * 1.02) {
    const badge = document.createElement("span");
    badge.className = "newlow-badge";
    badge.textContent = "新低";
    badge.title = `收盘价距 52 周最低 ${formatPrice(item.low52)} 不足 2%`;
    nameLine.append(badge);
  }
  const code = document.createElement("span");
  code.className = "code";
  code.textContent = `${item.code}.HK`;
  link.append(nameLine, code);
  cell.append(link);
  row.append(cell);
}

function detailFact(labelText, valueText, className = "") {
  const block = document.createElement("div");
  if (className) block.className = className;
  const label = document.createElement("span");
  label.className = "detail-label";
  label.textContent = labelText;
  const value = document.createElement("strong");
  value.textContent = valueText;
  block.append(label, value);
  return block;
}

function visibleColumnCount() {
  return [...document.querySelectorAll("#table-wrap thead th")]
    .filter((th) => getComputedStyle(th).display !== "none").length || 9;
}

function detailRow(item) {
  const row = document.createElement("tr");
  row.className = "detail-row";
  row.hidden = true;
  const cell = document.createElement("td");
  cell.colSpan = visibleColumnCount();
  const panel = document.createElement("div");
  panel.className = "detail-panel";
  const industryBlock = document.createElement("div");
  const industryLabel = document.createElement("span");
  industryLabel.className = "detail-label";
  industryLabel.textContent = "所属行业";
  const industry = document.createElement("p");
  industry.className = "industry";
  industry.textContent = item.industry || "暂无行业资料";
  industryBlock.append(industryLabel, industry);
  const introBlock = document.createElement("div");
  const introLabel = document.createElement("span");
  introLabel.className = "detail-label";
  introLabel.textContent = "公司简介";
  const intro = document.createElement("p");
  intro.textContent = item.introduction || "暂无公司简介";
  introBlock.append(introLabel, intro);
  const facts = document.createElement("div");
  facts.className = "detail-facts";
  facts.append(
    detailFact("总市值", `${formatHkd(item.marketCap)} 港币`),
    detailFact("换手率", formatRate(item.turnoverRate)),
    detailFact("振幅", formatRate(item.amplitude)),
    detailFact("成交量", formatVolume(item.volume)),
    detailFact("日内区间", `${formatPrice(item.low)} - ${formatPrice(item.high)}`),
    detailFact("市盈率 TTM", Number.isFinite(item.peTtm) ? item.peTtm.toFixed(2) : "--"),
    detailFact("市净率", Number.isFinite(item.pb) ? item.pb.toFixed(2) : "--"),
    detailFact("沽空比率", Number.isFinite(item.shortRatio) ? formatRate(item.shortRatio) : "--"),
    detailFact("沽空金额", Number.isFinite(item.shortAmt) ? `${formatHkd(item.shortAmt)} 港币` : "--"),
    detailFact("52周最高", Number.isFinite(item.high52) ? formatPrice(item.high52) : "--"),
    detailFact("52周最低", Number.isFinite(item.low52) ? formatPrice(item.low52) : "--"),
  );
  const position = rangePosition(item.close, item.high52, item.low52);
  if (position !== null) {
    const rangeBlock = document.createElement("div");
    rangeBlock.className = "range52";
    const label = document.createElement("span");
    label.className = "detail-label";
    label.textContent = "52周位置";
    const track = document.createElement("div");
    track.className = "range-track";
    const marker = document.createElement("i");
    marker.style.left = `${position.toFixed(1)}%`;
    marker.title = `现价位于 52 周区间的 ${position.toFixed(0)}% 分位`;
    track.append(marker);
    const value = document.createElement("strong");
    value.textContent = `${position.toFixed(0)}%`;
    rangeBlock.append(label, track, value);
    facts.append(rangeBlock);
  }
  if (item.continuity) {
    const avg = item.continuity.avgTurnover5d;
    const versusAvg = Number.isFinite(avg) && avg > 0 && Number.isFinite(item.turnover)
      ? formatPercent((item.turnover / avg - 1) * 100)
      : "--";
    facts.append(
      detailFact("连续上榜", `${item.continuity.top50Days} 个交易日`),
      detailFact("上一交易日成交额排名", item.continuity.prevRank ? `第 ${item.continuity.prevRank} 位` : "未进 Top 50"),
      detailFact("成交额较 5 日均值", versusAvg),
    );
  }
  if (item.industry) facts.append(industryBlock);
  if (item.ah) {
    const ahText = `A股 ${item.ah.aCode} · A股 ${formatPercent(item.ah.aChangePercent)} · H股 ${formatPercent(item.ah.hChangePercent)} · AH溢价 ${formatPercent(item.ah.premiumPercent)}`;
    facts.append(detailFact("AH 两地上市", ahText, "ah-detail"));
  }
  const quoteLink = document.createElement("div");
  quoteLink.className = "detail-link";
  const quoteAnchor = document.createElement("a");
  quoteAnchor.href = xueqiuUrl(item.code);
  quoteAnchor.target = "_blank";
  quoteAnchor.rel = "noopener noreferrer";
  quoteAnchor.textContent = "在雪球查看行情 ↗";
  quoteLink.append(quoteAnchor);
  panel.append(facts, quoteLink, introBlock);
  cell.append(panel);
  row.append(cell);
  return row;
}

function createDataRow(item, rank, { showContinuity = false } = {}) {
  const row = document.createElement("tr");
  row.className = "data-row";
  row.tabIndex = 0;
  row.setAttribute("aria-expanded", "false");
  appendCell(row, String(rank).padStart(2, "0"), "rank");
  securityCell(row, item, showContinuity);
  appendCell(row, formatPrice(item.close), "numeric optional-col");
  appendCell(row, formatPercent(item.changePercent), `numeric ${trendClass(item.changePercent)}`);
  appendCell(row, formatHkd(item.turnover), "numeric");
  appendCell(row, formatHkd(item.marketCap), "numeric optional-col");
  appendCell(row, formatRate(item.turnoverRate), "numeric optional-col");
  appendCell(row, formatRate(item.amplitude), "numeric optional-col");
  const detail = detailRow(item);
  const toggle = () => {
    const expanded = row.getAttribute("aria-expanded") === "true";
    row.setAttribute("aria-expanded", String(!expanded));
    detail.hidden = expanded;
  };
  row.addEventListener("click", toggle);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  });
  return [row, detail];
}

function dashboard() {
  const savedMetric = localStorage.getItem("hk-connect-sort-metric");
  const savedDirection = localStorage.getItem("hk-connect-sort-direction");
  const state = {
    snapshot: null,
    baseSnapshot: null,
    metric: Object.hasOwn(metricCopy, savedMetric) ? savedMetric : "turnover",
    direction: savedDirection === "asc" ? "asc" : "desc",
    query: "",
    ahOnly: false,
    liveEnabled: localStorage.getItem("hk-connect-live") === "true",
    liveResources: null,
    lastRefreshAt: 0,
    closeRefreshDate: null,
    refreshing: false,
  };
  const elements = {
    body: document.querySelector("#ranking-body"),
    table: document.querySelector("#table-wrap"),
    loading: document.querySelector("#loading"),
    error: document.querySelector("#error"),
    title: document.querySelector("#ranking-title"),
    note: document.querySelector("#ranking-note"),
    count: document.querySelector("#result-count"),
    liveToggle: document.querySelector("#live-toggle"),
    ahOnlyToggle: document.querySelector("#ah-only"),
    directionButton: document.querySelector("#sort-direction"),
  };

  elements.liveToggle.checked = state.liveEnabled;
  elements.directionButton.textContent = state.direction === "desc" ? "从高到低" : "从低到高";
  document.querySelectorAll("[data-metric]").forEach((button) => {
    const active = button.dataset.metric === state.metric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  function renderRows() {
    const universe = state.snapshot.securities ?? Object.values(state.snapshot.rankings).flat();
    const eligible = state.ahOnly ? universe.filter((item) => item.ah) : universe;
    const fullRanking = sortSecurities(eligible, state.metric, state.direction, 50);
    const searchPool = state.query
      ? filterRanking(sortSecurities(eligible, state.metric, state.direction, eligible.length), state.query).slice(0, 50)
      : fullRanking;
    const items = searchPool;
    elements.body.replaceChildren();
    const showContinuity = state.metric === "turnover" && state.direction === "desc";
    items.forEach((item, index) => elements.body.append(...createDataRow(item, index + 1, { showContinuity })));
    const metricLabel = metricCopy[state.metric];
    const directionLabel = state.direction === "desc" ? "由高到低" : "由低到高";
    elements.title.textContent = `${metricLabel} Top 50`;
    elements.note.textContent = `从全部港股通标的中按${metricLabel}${directionLabel}排列`;
    const { profitable, losing } = profitabilityCounts(fullRanking);
    elements.count.textContent = `${items.length} 只 · 盈利 ${profitable} / 亏损 ${losing}`;
    renderSummary(summarizeRanking(fullRanking));
  }

  function setSummaryValue(selector, value, trend = null) {
    const element = document.querySelector(selector);
    element.textContent = value;
    element.className = trend === null ? "" : trendClass(trend);
  }

  function renderSummary(summary) {
    setSummaryValue("#average-turnover", `${formatHkd(summary.averageTurnover)} 港币`);
    setSummaryValue("#median-turnover", `${formatHkd(summary.medianTurnover)} 港币`);
    setSummaryValue("#average-change", formatPercent(summary.averageChangePercent), summary.averageChangePercent);
    setSummaryValue("#median-change", formatPercent(summary.medianChangePercent), summary.medianChangePercent);
    setSummaryValue(
      "#ranking-breadth",
      `${summary.advancers} 涨 / ${summary.decliners} 跌 / ${summary.unchanged} 平`,
    );
    setSummaryValue(
      "#change-range",
      `${formatPercent(summary.maxChangePercent)} / ${formatPercent(summary.minChangePercent)}`,
    );
    setSummaryValue("#average-market-cap", `${formatHkd(summary.averageMarketCap)} 港币`);
    setSummaryValue("#median-market-cap", `${formatHkd(summary.medianMarketCap)} 港币`);
    setSummaryValue("#ah-count", `${summary.ahCount} 只`);
  }

  function renderHeader(snapshot) {
    const updated = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Hong_Kong",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(snapshot.generatedAt));
    document.querySelector("#as-of").textContent = `${snapshot.tradeDate} · ${updated} 更新`;
    document.querySelector("#status-text").textContent = snapshot.marketStatus === "intraday" ? "盘中快照" : "收盘数据";
    document.querySelector("#status-dot").classList.toggle("close", snapshot.marketStatus !== "intraday");
    document.querySelector("#advancers").textContent = snapshot.market.advancers;
    document.querySelector("#decliners").textContent = snapshot.market.decliners;
    document.querySelector("#market-turnover").textContent = `${formatHkd(snapshot.market.turnover)} 港币`;
    document.querySelector("#coverage").textContent = `${(snapshot.coverage.ratio * 100).toFixed(1)}%`;
    document.querySelector("#coverage-bar").style.width = `${snapshot.coverage.ratio * 100}%`;
    document.querySelector("#source-note").textContent = `行情：${snapshot.source.market}。公司资料：${snapshot.source.profiles}。`;
    renderEditorial(snapshot);
    renderFreshness(snapshot);
  }

  function renderEditorial(snapshot) {
    const insights = buildDailyInsights(snapshot.rankings?.turnover ?? []);
    document.querySelector("#daily-view").textContent = insights.headline;
    document.querySelector("#issue-number").textContent = snapshot.tradeDate.replaceAll("-", "").slice(2);
    document.querySelector("#cover-advancers").textContent = snapshot.market.advancers;
    document.querySelector("#cover-decliners").textContent = snapshot.market.decliners;
    document.querySelector("#cover-turnover").textContent = formatHkd(snapshot.market.turnover);
    const southbound = document.querySelector("#cover-southbound");
    southbound.textContent = formatSignedHkd(snapshot.market.southboundNetBuy);
    southbound.className = trendClass(snapshot.market.southboundNetBuy);
    renderSummaryText(snapshot);
    const list = document.querySelector("#observation-list");
    list.replaceChildren(...insights.bullets.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
    const turnoverItems = snapshot.rankings?.turnover ?? [];
    const total = turnoverItems.reduce((sum, item) => sum + (item.turnover ?? 0), 0);
    const topTen = turnoverItems.slice(0, 10);
    const concentration = total ? topTen.reduce((sum, item) => sum + (item.turnover ?? 0), 0) / total * 100 : 0;
    document.querySelector("#concentration-value").textContent = `${concentration.toFixed(1)}%`;
    document.querySelector("#concentration-dial").style.setProperty("--value", Math.min(100, Math.max(0, concentration)).toFixed(1));
    const breadth = snapshot.market.advancers / Math.max(1, snapshot.market.advancers + snapshot.market.decliners);
    document.querySelector("#breadth-reading").textContent = breadth >= .6 ? "上涨占优，市场宽度偏强" : breadth <= .4 ? "下跌占优，市场宽度偏弱" : "涨跌接近，市场表现分化";
    renderFocusRanking(topTen);
  }

  function renderSummaryText(snapshot) {
    const textElement = document.querySelector("#summary-text");
    try {
      textElement.textContent = buildDailySummary(snapshot);
    } catch (error) {
      textElement.textContent = "今日盘点文稿生成失败，请稍后重试。";
    }
  }

  function renderFocusRanking(items) {
    const container = document.querySelector("#focus-ranking");
    const leaderTurnover = items[0]?.turnover;
    container.replaceChildren(...items.map((item, index) => {
      const row = document.createElement("li");
      row.innerHTML = `<span class="focus-rank">${String(index + 1).padStart(2, "0")}</span><a href="${xueqiuUrl(item.code)}" target="_blank" rel="noopener noreferrer"><strong>${item.name}</strong><small>${item.code}.HK</small></a><span class="focus-change ${trendClass(item.changePercent)}">${formatPercent(item.changePercent)}</span><span class="focus-bar"><i style="width:${turnoverShare(item.turnover, leaderTurnover)}%"></i></span><b>${formatHkd(item.turnover)}</b>`;
      return row;
    }));
  }

  function latestQuoteTime(snapshot) {
    const timestamps = (snapshot.securities ?? []).map((item) => item.timestamp).filter(Number.isFinite);
    return timestamps.length ? Math.max(...timestamps) * 1000 : Date.parse(snapshot.generatedAt);
  }

  function renderFreshness(snapshot) {
    const timestamp = latestQuoteTime(snapshot);
    const quoteTime = Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Hong_Kong",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(timestamp))
      : "--";
    document.querySelector("#quote-time").textContent = `行情时间 ${quoteTime}`;
    const freshness = dataFreshness(timestamp);
    const element = document.querySelector("#freshness-text");
    if (snapshot.marketStatus !== "intraday") {
      element.textContent = "正式收盘快照";
      element.className = "freshness close";
    } else if (freshness.state === "fresh") {
      element.textContent = `${freshness.ageSeconds} 秒前`;
      element.className = "freshness";
    } else if (freshness.state === "delayed") {
      element.textContent = `延迟 ${freshness.ageSeconds} 秒`;
      element.className = "freshness delayed";
    } else {
      element.textContent = freshness.ageSeconds === null ? "时间未知" : `已滞后 ${Math.ceil(freshness.ageSeconds / 60)} 分钟`;
      element.className = "freshness stale";
    }
  }

  function setStatus(text, stateClass = "") {
    document.querySelector("#status-text").textContent = text;
    document.querySelector("#status-dot").className = `status-dot ${stateClass}`.trim();
  }

  function tradeDateFromQuotes(quotes) {
    const timestamp = Math.max(...quotes.map((quote) => quote.timestamp).filter(Number.isFinite));
    if (!Number.isFinite(timestamp)) throw new Error("行情没有有效时间");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp * 1000));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  async function loadLiveResources() {
    if (!state.liveResources) {
      state.liveResources = Promise.all([
        fetch("data/universe.json").then((response) => response.json()),
        fetch("data/company-profiles.json").then((response) => response.json()),
        fetch("public/data/ah-pairs.json").then((response) => response.json()),
      ]).then(([universe, profiles, ahData]) => ({ universe: rankableUniverse(universe), profiles, ahPairs: ahData.pairs }));
    }
    return state.liveResources;
  }

  async function refreshLive({ final = false } = {}) {
    if (state.refreshing) return;
    const phase = liveMarketPhase();
    if (phase !== "trading" && !final) {
      setStatus(phase === "lunch" ? "午间暂停" : "非交易时段", "close");
      return;
    }
    state.refreshing = true;
    setStatus(final ? "收盘校准中" : "正在刷新");
    try {
      const { universe, profiles, ahPairs } = await loadLiveResources();
      const quotes = await fetchEastmoneyUniverseQuotes(universe.map((item) => item.code));
      const generatedAt = new Date().toISOString();
      state.snapshot = carryForwardEnhancements(buildSnapshot({
        quotes,
        universe,
        profiles,
        ahPairs,
        generatedAt,
        tradeDate: tradeDateFromQuotes(quotes),
        marketStatus: final ? "close" : "intraday",
        limit: 50,
        minimumCoverage: 0.8,
      }), state.baseSnapshot);
      state.lastRefreshAt = Date.now();
      renderHeader(state.snapshot);
      renderRows();
    } catch (error) {
      console.error("Live refresh failed", error);
      setStatus("盘中刷新失败", "error");
    } finally {
      state.refreshing = false;
    }
  }

  function checkLiveRefresh() {
    if (state.refreshing) return;
    const now = new Date();
    if (shouldRefreshAtClose({
      now,
      enabled: state.liveEnabled,
      visible: document.visibilityState === "visible",
      refreshedDate: state.closeRefreshDate,
    })) {
      state.closeRefreshDate = hongKongDate(now);
      refreshLive({ final: true });
      return;
    }
    if (shouldRefreshLive({
      now,
      enabled: state.liveEnabled,
      visible: document.visibilityState === "visible",
      lastRefreshAt: state.lastRefreshAt,
    })) refreshLive();
  }

  async function checkStaticSnapshot() {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch(`public/data/latest.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate = await response.json();
      if (!isNewerSnapshot(state.baseSnapshot, candidate)) return;
      state.baseSnapshot = candidate;
      if (!state.liveEnabled || liveMarketPhase() !== "trading") {
        state.snapshot = candidate;
        renderHeader(candidate);
        renderRows();
      }
    } catch (error) {
      console.warn("Static snapshot check failed", error);
    }
  }

  document.querySelectorAll("[data-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = button.dataset.metric;
      localStorage.setItem("hk-connect-sort-metric", state.metric);
      document.querySelectorAll("[data-metric]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      renderRows();
    });
  });
  elements.directionButton.addEventListener("click", () => {
    state.direction = state.direction === "desc" ? "asc" : "desc";
    localStorage.setItem("hk-connect-sort-direction", state.direction);
    elements.directionButton.textContent = state.direction === "desc" ? "从高到低" : "从低到高";
    renderRows();
  });
  document.querySelector("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRows();
  });
  elements.ahOnlyToggle.addEventListener("change", () => {
    state.ahOnly = elements.ahOnlyToggle.checked;
    renderRows();
  });
  elements.liveToggle.addEventListener("change", () => {
    state.liveEnabled = elements.liveToggle.checked;
    localStorage.setItem("hk-connect-live", String(state.liveEnabled));
    if (state.liveEnabled) {
      state.lastRefreshAt = 0;
      refreshLive();
    } else if (state.baseSnapshot) {
      state.snapshot = state.baseSnapshot;
      renderHeader(state.snapshot);
      renderRows();
    }
  });
  document.querySelector("#copy-summary").addEventListener("click", async () => {
    const button = document.querySelector("#copy-summary");
    const text = document.querySelector("#summary-text").textContent;
    const markCopied = () => {
      button.textContent = "已复制 ✓";
      setTimeout(() => {
        button.textContent = "复制全文";
      }, 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch (error) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (copied) markCopied();
      else button.textContent = "复制失败，请手动选择";
    }
  });
  document.addEventListener("visibilitychange", () => {
    checkLiveRefresh();
    checkStaticSnapshot();
  });
  window.addEventListener("resize", () => {
    const colSpan = visibleColumnCount();
    document.querySelectorAll("tr.detail-row td").forEach((cell) => {
      cell.colSpan = colSpan;
    });
  });
  setInterval(checkLiveRefresh, 15_000);
  setInterval(checkStaticSnapshot, 60_000);
  setInterval(() => {
    if (state.snapshot) renderFreshness(state.snapshot);
  }, 15_000);

  fetch(`public/data/latest.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((snapshot) => {
      state.baseSnapshot = snapshot;
      state.snapshot = snapshot;
      renderHeader(snapshot);
      renderRows();
      elements.loading.hidden = true;
      elements.table.hidden = false;
      checkLiveRefresh();
    })
    .catch((error) => {
      elements.loading.hidden = true;
      elements.error.hidden = false;
      elements.error.textContent = `榜单加载失败：${error.message}。请稍后重试。`;
      document.querySelector("#status-text").textContent = "数据异常";
    });
}

if (typeof document !== "undefined") dashboard();
import { fetchEastmoneyUniverseQuotes } from "./src/adapters/eastmoney.mjs";
import { formatPercent } from "./src/lib/format.mjs";
import { buildDailySummary } from "./src/lib/daily-summary.mjs";

export { formatPercent };
import { buildSnapshot, carryForwardEnhancements, normalizeCode, rankableUniverse } from "./src/lib/pipeline.mjs";
import { buildDailyInsights } from "./src/lib/share-image.mjs";
import {
  dataFreshness,
  hongKongDate,
  liveMarketPhase,
  shouldRefreshAtClose,
  shouldRefreshLive,
} from "./src/lib/market-clock.mjs";
