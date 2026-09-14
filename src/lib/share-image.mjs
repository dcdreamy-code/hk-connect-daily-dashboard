const WIDTH = 1242;
const HEIGHT = 3660;
const INK = "#1B1D1B";
const INK_SOFT = "#3C403C";
const MUTED = "#6D736E";
const FAINT = "#9AA09A";
const PAPER = "#F7F5EF";
const PAPER_DEEP = "#F0EDE4";
const SURFACE = "#FFFFFF";
const SURFACE_ALT = "#FAF8F2";
const LINE = "#E5E2D7";
const LINE_STRONG = "#C8C4B6";
const COPPER = "#A4763A";
const COPPER_DEEP = "#7F5A26";
const GOLD = "#D3AA6A";
const ON_INK = "#F6F2E8";
const ON_INK_SUB = "#9FA49C";
const ON_INK_HAIRLINE = "#5E563F";
const UP = "#C93A30";
const DOWN = "#0A7A52";
const SANS = `"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif`;
const SERIF = `"Noto Serif CJK SC","Noto Serif SC","Songti SC","STSong",${SANS}`;
const MONO = `"IBM Plex Mono","Noto Sans Mono CJK SC",monospace`;

function xml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function numbers(items, key) {
  return items.map((item) => item[key]).filter(Number.isFinite);
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

function compact(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(Math.round(value));
}

function percent(value, signed = true) {
  if (!Number.isFinite(value)) return "--";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function shorten(value, max = 13) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function wrapHeadline(text, max = 23) {
  const lines = [];
  let current = "";
  for (const char of String(text)) {
    current += char;
    if (current.length >= max && "、，。：；".includes(char)) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export function buildDailyInsights(items) {
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
  const newHighs = items.filter((item) => Number.isFinite(item.high52) && Number.isFinite(item.close) && item.close >= item.high52 * 0.98);
  const newLows = items.filter((item) => Number.isFinite(item.low52) && Number.isFinite(item.close) && item.close <= item.low52 * 1.02);
  const leaderDays = leader?.continuity?.top50Days;

  const standout = newHighs.length >= 2
    ? `${newHighs.slice(0, 2).map((item) => item.name).join("、")}创 52 周新高`
    : newHighs.length === 1
      ? `${newHighs[0].name}创 52 周新高`
      : newLows.length >= 2
        ? `${newLows.slice(0, 2).map((item) => item.name).join("、")}创 52 周新低`
        : newLows.length === 1
          ? `${newLows[0].name}创 52 周新低`
          : extremeUp
            ? `${extremeUp.name}领涨全场`
            : "";

  const headline = `港股通 ${advancers} 涨 ${decliners} 跌${standout ? `；${standout}` : ""}。`;

  const bullets = [
    `成交集中度｜Top 10 占 Top 50 成交额 ${concentration.toFixed(1)}%`,
    `龙头观察｜${leader.name} 成交 ${compact(leader.turnover)}港币居首${leaderDays ? `，连续 ${leaderDays} 日上榜` : ""}`,
    shortFocus && shortFocus.shortRatio >= 20
      ? `沽空与极值｜${extremeUp.name} ${percent(extremeUp.changePercent)} 领涨，${extremeDown.name} ${percent(extremeDown.changePercent)} 领跌；${shortFocus.name} 沽空比 ${percent(shortFocus.shortRatio, false)}`
      : `极值扫描｜${extremeUp.name} ${percent(extremeUp.changePercent)} 领涨，${extremeDown.name} ${percent(extremeDown.changePercent)} 领跌`,
  ];
  return { headline, bullets };
}

function concentrationOf(items) {
  const total = items.reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  const topTen = items.slice(0, 10).reduce((sum, item) => sum + (item.turnover ?? 0), 0);
  return total ? topTen / total * 100 : 0;
}

function buildSummary(items) {
  const turnovers = numbers(items, "turnover");
  const marketCaps = numbers(items, "marketCap");
  const changes = numbers(items, "changePercent");
  return [
    ["TOP 50 总成交额", `${compact(turnovers.reduce((sum, value) => sum + value, 0))} 港币`],
    ["成交额中位数", `${compact(median(turnovers))} 港币`],
    ["总市值中位数", `${compact(median(marketCaps))} 港币`],
    ["平均涨跌幅", percent(average(changes))],
    ["上涨 / 下跌", `${changes.filter((value) => value > 0).length} / ${changes.filter((value) => value < 0).length}`],
    ["AH 股票", `${items.filter((item) => item.ah).length} 只`],
  ];
}

function renderMasthead(snapshot, generated) {
  const issue = snapshot.tradeDate.replaceAll("-", "").slice(2);
  return `
    <rect width="1242" height="3660" fill="${PAPER}"/>
    <rect width="1242" height="168" fill="${INK}"/>
    <rect x="0" y="167" width="1242" height="2" fill="${GOLD}"/>
    <rect x="42" y="52" width="18" height="18" fill="${GOLD}"/>
    <rect x="48" y="58" width="6" height="6" fill="${INK}"/>
    <text x="88" y="112" class="brand-word" fill="${ON_INK}">港美侠</text>
    <line x1="292" y1="48" x2="292" y2="122" stroke="${ON_INK_HAIRLINE}"/>
    <text x="320" y="84" class="column-name" fill="${GOLD}">港股通每日资金榜</text>
    <text x="320" y="120" class="edition-en" fill="#878C85">GANGMEIXIA · HK &amp; US MARKET NOTE</text>
    <text x="1200" y="76" text-anchor="end" class="issue-no" fill="${GOLD}">收盘刊 No.${xml(issue)}</text>
    <text x="1200" y="114" text-anchor="end" class="masthead-date" fill="${ON_INK_SUB}">${xml(snapshot.tradeDate)} · ${xml(generated)} 更新</text>`;
}

function renderCover(items, snapshot) {
  const market = snapshot.market ?? {};
  const concentration = concentrationOf(items);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const arc = Math.min(100, Math.max(0, concentration)) / 100 * circumference;
  const headlineLines = wrapHeadline(buildDailyInsights(items).headline);
  const southboundNetBuy = Number.isFinite(market.southboundNetBuy) ? market.southboundNetBuy : null;
  const stats = [
    ["港股通上涨", String(market.advancers ?? "--"), UP],
    ["港股通下跌", String(market.decliners ?? "--"), DOWN],
    ["港股通成交额 · 港币", compact(market.turnover), INK],
    ["南向净买入 · 港币", southboundNetBuy === null ? "--" : `${southboundNetBuy > 0 ? "+" : southboundNetBuy < 0 ? "-" : ""}${compact(Math.abs(southboundNetBuy))}`, southboundNetBuy > 0 ? UP : southboundNetBuy < 0 ? DOWN : INK],
  ];
  return `
    <text x="42" y="234" class="cover-edition" fill="${COPPER}">港美侠资金雷达</text>
    <text x="1200" y="234" text-anchor="end" class="cover-edition-right" fill="${FAINT}">成交额 TOP 50 · 收盘数据</text>
    <line x1="42" y1="254" x2="1200" y2="254" stroke="${LINE_STRONG}"/>
    <line x1="42" y1="300" x2="66" y2="300" stroke="${COPPER}" stroke-width="2"/>
    <text x="78" y="306" class="cover-kicker" fill="${COPPER}">今日一句话</text>
    ${headlineLines.map((line, index) => `<text x="42" y="${378 + index * 68}" class="headline" fill="${INK}">${xml(line)}</text>`).join("")}
    ${stats.map(([label, value, color], index) => {
    const x = 42 + index * 258;
    return `<text x="${x}" y="548" class="cover-stat-value" fill="${color}">${xml(value)}</text><text x="${x}" y="582" class="cover-stat-label" fill="${MUTED}">${xml(label)}</text>${index > 0 ? `<line x1="${x - 28}" y1="512" x2="${x - 28}" y2="586" stroke="${LINE}"/>` : ""}`;
  }).join("")}
    <text x="1078" y="424" text-anchor="middle" class="dial-label" fill="${MUTED}">TOP 10 资金集中度</text>
    <circle cx="1078" cy="530" r="${radius}" fill="none" stroke="${LINE}" stroke-width="13"/>
    <circle cx="1078" cy="530" r="${radius}" fill="none" stroke="${COPPER}" stroke-width="13" stroke-linecap="butt" stroke-dasharray="${arc.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 1078 530)"/>
    <text x="1078" y="542" text-anchor="middle" class="dial-value" fill="${COPPER_DEEP}">${concentration.toFixed(1)}%</text>`;
}

function renderInsights(items) {
  const insights = buildDailyInsights(items);
  return `
    <text x="42" y="676" class="section-title" fill="${INK}">今日观察</text>
    <text x="42" y="708" class="section-sub" fill="${COPPER}">OBSERVATIONS · 03</text>
    ${insights.bullets.map((bullet, index) => {
    const y = 746 + index * 62;
    return `<line x1="42" y1="${y - 34}" x2="1200" y2="${y - 34}" stroke="${LINE}"/><text x="42" y="${y}" class="insight-no" fill="${COPPER}">${String(index + 1).padStart(2, "0")}</text><text x="92" y="${y}" class="insight" fill="${INK_SOFT}">${xml(bullet)}</text>`;
  }).join("")}`;
}

function renderSummary(items) {
  const top = 906;
  const rowHeight = 82;
  return `
    <line x1="42" y1="${top - 14}" x2="1200" y2="${top - 14}" stroke="${LINE_STRONG}"/>
    ${buildSummary(items).map(([label, value], index) => {
    const x = 42 + (index % 3) * 386;
    const y = top + Math.floor(index / 3) * rowHeight;
    const color = label === "平均涨跌幅" ? (value.startsWith("+") ? UP : value.startsWith("-") ? DOWN : INK) : INK;
    return `<text x="${x}" y="${y + 28}" class="metric-label" fill="${MUTED}">${xml(label)}</text><text x="${x}" y="${y + 64}" class="metric-value" fill="${color}">${xml(value)}</text>`;
  }).join("")}
    <line x1="42" y1="${top + rowHeight - 12}" x2="1200" y2="${top + rowHeight - 12}" stroke="${LINE}"/>
    <line x1="428" y1="${top - 14}" x2="428" y2="${top + rowHeight * 2 - 12}" stroke="${LINE}"/>
    <line x1="814" y1="${top - 14}" x2="814" y2="${top + rowHeight * 2 - 12}" stroke="${LINE}"/>
    <line x1="42" y1="${top + rowHeight * 2 - 12}" x2="1200" y2="${top + rowHeight * 2 - 12}" stroke="${LINE_STRONG}"/>`;
}

function renderTableHead(top) {
  const columns = [["排名 / 证券", 66, "start"], ["涨跌幅", 610, "end"], ["成交额", 800, "end"], ["总市值", 1010, "end"], ["换手率", 1190, "end"]];
  return `
    <rect x="42" y="${top}" width="1158" height="3" fill="${INK}"/>
    <rect x="42" y="${top + 3}" width="1158" height="52" fill="${PAPER_DEEP}"/>
    ${columns.map(([label, x, anchor]) => `<text x="${x}" y="${top + 37}" text-anchor="${anchor}" class="table-head" fill="${MUTED}">${label}</text>`).join("")}`;
}

function renderRows(items) {
  const rowStart = 1178;
  const rowHeight = 48;
  return items.map((item, index) => {
    const y = rowStart + index * rowHeight;
    const rank = index + 1;
    const trendColor = item.changePercent > 0 ? UP : item.changePercent < 0 ? DOWN : INK;
    const zebra = index % 2 ? SURFACE_ALT : SURFACE;
    const badge = item.ah ? `<g data-ah-badge="${rank}"><rect x="388" y="${y + 13}" width="40" height="21" rx="3" fill="#F4EBDD" stroke="${COPPER}"/><text x="408" y="${y + 29}" text-anchor="middle" class="ah" fill="${COPPER_DEEP}">AH</text></g>` : "";
    const lossMark = Number.isFinite(item.peTtm) && item.peTtm < 0 ? `<g data-loss-mark="${rank}"><rect x="438" y="${y + 13}" width="30" height="21" rx="3" fill="${INK}" stroke="${INK}"/><text x="453" y="${y + 29}" text-anchor="middle" class="ah" fill="${PAPER}">亏</text></g>` : "";
    const divider = rank % 10 === 0
      ? `<line data-group-divider="${rank}" x1="42" y1="${y + rowHeight}" x2="1200" y2="${y + rowHeight}" stroke="${LINE_STRONG}" stroke-width="2"/>`
      : `<line x1="42" y1="${y + rowHeight}" x2="1200" y2="${y + rowHeight}" stroke="${LINE}"/>`;
    return `<g data-rank-row="${rank}"><rect x="42" y="${y}" width="1158" height="${rowHeight}" fill="${zebra}"/><text x="66" y="${y + 31}" class="rank" fill="${rank <= 10 ? COPPER : FAINT}">${String(rank).padStart(2, "0")}</text><g data-security-line="${rank}"><text x="118" y="${y + 31}" class="name" fill="${INK}">${xml(shorten(item.name, 7))}</text><text x="300" y="${y + 31}" class="code" fill="${FAINT}">${xml(item.code)}.HK</text>${badge}${lossMark}</g><text x="610" y="${y + 31}" text-anchor="end" class="number" fill="${trendColor}">${xml(percent(item.changePercent))}</text><text x="800" y="${y + 31}" text-anchor="end" class="number" fill="${INK}">${xml(compact(item.turnover))}</text><text x="1010" y="${y + 31}" text-anchor="end" class="figure" fill="${INK}">${xml(compact(item.marketCap))}</text><text x="1190" y="${y + 31}" text-anchor="end" class="figure" fill="${INK}">${xml(percent(item.turnoverRate, false))}</text>${divider}</g>`;
  }).join("");
}

export function buildShareImageSvg(snapshot) {
  const items = snapshot.rankings?.turnover ?? [];
  if (items.length !== 50) throw new Error(`share image requires 50 turnover records, received ${items.length}`);
  const generated = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Hong_Kong", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(snapshot.generatedAt));
  const tableTop = 1120;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><style>text{font-family:${SANS}}.brand-word,.headline,.section-title{font-family:${SERIF}}.metric-value,.rank,.number,.figure,.code,.ah,.issue-no,.masthead-date,.edition-en,.cover-stat-value,.dial-value{font-family:${MONO}}.brand-word{font-size:56px;font-weight:900;letter-spacing:6px}.column-name{font-size:25px;font-weight:600;letter-spacing:7px}.edition-en{font-size:14px;letter-spacing:2px}.issue-no{font-size:20px;font-weight:700;letter-spacing:2px}.masthead-date{font-size:15px}.cover-edition{font-size:16px;font-weight:600;letter-spacing:4px}.cover-edition-right{font-size:15px;letter-spacing:2px}.cover-kicker{font-size:15px;font-weight:600;letter-spacing:4px}.headline{font-size:44px;font-weight:700}.cover-stat-value{font-size:38px;font-weight:700}.cover-stat-label{font-size:16px;letter-spacing:3px}.dial-label{font-size:14px;letter-spacing:2px}.dial-value{font-size:28px;font-weight:700}.section-title{font-size:30px;font-weight:700;letter-spacing:4px}.section-sub{font-size:13px;font-weight:600;letter-spacing:3px}.insight-no{font-size:15px;font-weight:700}.insight{font-size:22px}.metric-label{font-size:16px;letter-spacing:3px}.metric-value{font-size:30px;font-weight:700}.table-head{font-size:19px;font-weight:600;letter-spacing:2px}.rank{font-size:20px;font-weight:700}.name{font-size:22px;font-weight:700}.code{font-size:13px}.number{font-size:21px;font-weight:700}.figure{font-size:21px;font-weight:600}.ah{font-size:13px;font-weight:700}</style></defs>${renderMasthead(snapshot, generated)}${renderCover(items, snapshot)}${renderInsights(items)}${renderSummary(items)}${renderTableHead(tableTop)}${renderRows(items)}<text x="42" y="3602" font-size="15" fill="${MUTED}">行情：东方财富网页行情 · AH：东方财富 AH 股映射 · 公司资料：Wind / 东方财富 F10</text><text x="42" y="3630" font-size="14" fill="${FAINT}">数据日期以标题为准。每日观察由榜单数据规则生成，不构成投资建议。</text><rect x="1064" y="3584" width="12" height="12" fill="${COPPER}"/><rect x="1068" y="3588" width="4" height="4" fill="${PAPER}"/><text x="1200" y="3602" text-anchor="end" font-size="22" font-weight="700" fill="${INK}">港美侠出品</text><text x="1200" y="3630" text-anchor="end" class="edition-en" fill="${FAINT}">GANGMEIXIA MARKET NOTE</text></svg>`;
}
