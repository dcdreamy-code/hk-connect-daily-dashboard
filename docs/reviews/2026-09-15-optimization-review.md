# 港股通每日资金榜 · 系统性优化体检

- 体检日期：2026-09-15
- 对象：`projects/港股通`（港美侠 · 港股通每日资金榜）
- 方式：静态代码审查 + 本地数据/资产核算 + **线上双地址实测**（Workers / Pages）
- 代码规模：网 3,982 行（app.js 743 / styles.css 327 / src 与 scripts 约 1,300 / test 约 1,000）
- 现有测试：`npm test` 53 项全绿（实测通过）

---

## 一、结论摘要

项目本体质量不错：依赖只有一个 `sharp`、覆盖率门槛与失败不回写、原子写、行情时间取自行情自身而非请求时间、页面不把旧数据冒充当日。真正的问题**不在业务逻辑，而在「发布面治理」和「载荷设计」**——两条发布路径内容不一致、原始仓库与历史归档被公开、首屏与轮询拉的是同一份 1.26MB 全量文件。

| 级别 | 问题 | 实测证据 | 预期收益 |
|---|---|---|---|
| **P0-1** | Pages 备用站把整个仓库发布到公网 | `README.md`、`docs/plans/*.md`、`scripts/`、`test/`、`src/`、`package.json`、`GGTBDZQMD.xls` 均可直接 200 下载 | 消除内部文档/测试/原始数据外泄 |
| **P0-2** | 历史归档随站发布，且无保留策略 | 部署资产 10.85MB，其中归档 7.23MB（67%），每交易日 +2.8MB 永久累积 | 部署体积 −67%，停止线性膨胀 |
| **P0-3** | 轮询绕过缓存，服务端明明支持 304 | `cache:"no-store"`+`?ts=` → 每次整包 389KB（br）；带 `If-None-Match` 实测返回 **HTTP 304 / 0 字节** | 开着标签页 1 小时约 23MB → 趋近 0 |
| **P0-4** | 快照 53.6% 体积是重复的静态公司简介 | `introduction` 占 674,996 / 1,258,615 字节（同一段文字在 securities + 3 个榜里重复约 810 次） | 首屏 1.26MB → 约 0.56MB |
| **P1** | 9 项代码/口径一致性问题（死代码、README 与代码矛盾、大数格式化不一致等） | 见第三节，均已定位到行 | 可维护性 |
| **P2** | 5 项工程整洁项（7.4MB 一次性产物、docs 未归档、DOM 冗余等） | 见第四节 | 工作区与运行效率 |

---

## 二、P0：发布面治理（建议优先做）

### P0-1 Pages 备用站发布范围失控，与 Workers 不一致

`.assetsignore` **只对 Workers Static Assets 生效，Pages 直传不读这个文件**。实测对照：

| 路径 | Workers 主站 | Pages 备用站 |
|---|---|---|
| `README.md` | 404 ✅ | **200 / 8,383B** ❌ |
| `docs/plans/2026-09-10-hk-connect-daily-dashboard.md` | 404 ✅ | **200 / 4,206B** ❌ |
| `scripts/refresh-data.mjs` | 404 ✅ | **200 / 8,137B** ❌ |
| `test/ui.test.mjs` | 404 ✅ | **200 / 5,710B** ❌ |
| `package.json` / `wrangler.worker.toml` | 404 ✅ | **200** ❌ |
| `GGTBDZQMD.xls`（Wind 原始名单） | 404 ✅ | **200 / 87,040B** ❌ |
| `data/company-profiles.json` | 200（页面需要） | 200 |

影响有两层：

1. **内容外泄**：内部设计稿、测试、源码、Wind 原始数据全部可被任意人下载。
2. **README 失真**：README 第 84 行称两个地址是"同一份内容"，实际不是。两条发布路径已经漂移，将来任何依赖 `.assetsignore` 的收敛都会在 Pages 上静默失效。

Pages 对不存在的路径还会回退返回 `index.html`（实测 `outputs/dashboard-desktop.png` 等返回 200 + 10,059B = index.html 体积），所以**不能靠"打不开"来判断是否发布过**，必须显式排除。

**建议做法**：Pages 改为部署一个独立构建目录，而不是仓库根。

```toml
# wrangler.toml
name = "hk-gmx"
pages_build_output_dir = "dist"
```

配合一条只复制站点所需文件的同步脚本（`index.html app.js styles.css _headers src/ data/ public/data/latest.json public/data/ah-pairs.json public/images/latest.png`），`npm run deploy` 改为先建 `dist/` 再部署；同时补一个 `404.html`，避免不存在路径静默返回首页。

### P0-2 历史归档不应发布，且需要保留窗口

实测部署资产 10.85MB 的构成：

| 文件 | 体积 |
|---|---|
| `public/images/latest.png` | 1.59 MB |
| `public/data/latest.json` | 1.23 MB |
| `data/company-profiles.json` | 0.62 MB |
| `public/data/daily/*.json`（3 天） | **3.40 MB** |
| `public/images/daily/*.png`（3 天） | **3.83 MB** |
| 其余（ah-pairs / universe / app.js / styles.css / index.html） | 约 0.18 MB |

归档合计 **7.23MB（67%）**，而页面只读 `public/data/latest.json` 与 `public/images/latest.png`。daily 归档只被 `scripts/refresh-data.mjs` 在**服务端**读取（用于连榜天数、5 日均值、52 周兜底），Git 检出里就有，**无需作为静态资产发布**。

**建议做法**：

1. `.assetsignore` 增加两行：`public/data/daily`、`public/images/daily`。
2. `refresh-data.mjs` 的 `loadPreviousSnapshots(tradeDate, max = 5)` 之外，增加归档保留窗口（例如只保留最近 60 个交易日），否则仓库与部署包按每交易日 +2.8MB 永久增长，一年约 700MB。

### P0-3 轮询绕过缓存

`app.js` 的 `checkStaticSnapshot()` 每 60 秒执行一次：

```js
fetch(`public/data/latest.json?ts=${Date.now()}`, { cache: "no-store" })
```

`?ts=` 让每次请求都是新 URL（CDN 缓存键不同），`no-store` 让浏览器不参与协商缓存 —— 双重绕过，每次都要整包。实测服务端完全支持条件请求：

```
ETag: "fda6f5b9c2e4a74907692362475c4323"
带 If-None-Match 请求 → HTTP 304，下载 0 字节
```

而当前行为下每轮的实际传输量：**389KB（brotli 后）/ 1,258,615 字节（未压缩）**。标签页开着一小时 ≈ 23MB 纯浪费。

**建议做法**（二选一）：

- **最省事**：去掉 `?ts=`，把 `cache:"no-store"` 改为 `cache:"no-cache"`（允许存储但每次协商）。命中 304 时开销接近 0，代码改动两处。
- **最彻底**：写一个约 100 字节的 `public/data/version.json`（只含 `tradeDate` + `generatedAt`），轮询它，只有变新了才拉全量快照。`_headers` 里给 `latest.json` 放开常规协商缓存。

注意 `_headers` 现在给 `latest.json` 设的是 `public, max-age=0, must-revalidate`，这个策略本身是对的 —— 是前端的两处写法把它的收益抹掉了。

### P0-4 快照一半是重复的静态简介

```
latest.json 磁盘字节        1,258,615
  securities 内简介           552,921  (43.9%)
  rankings 内简介（重复）     122,075  ( 9.7%)
  简介合计                    674,996  (53.6%)  ← 去掉后 1.26MB → 0.56MB
```

原因：`src/lib/pipeline.mjs` 的 `enrich()` 把 `profile.introduction` 写进每个对象，而 `enrichList()` 对 `securities`（660 只）和 `turnover`/`gainers`/`losers`（各 50 只）各跑一遍 —— 同一段 228 字的公司简介在一份快照里被复制约 810 次。更可惜的是，这段文字本来就已经单独存在于 `data/company-profiles.json`（616KB，目前只在盘中模式才拉取）。

**建议做法**：快照不再内嵌 `introduction`；用户点击某行展开详情时，按需获取 `company-profiles.json`（已部署、可长缓存）并缓存到内存。首屏体积立减约 53%，每份归档同比例瘦身，历史归档的增长速度也一并下降。

---

## 三、P1：代码与口径一致性

| # | 问题 | 位置 | 说明与建议 |
|---|---|---|---|
| 5 | `selectRanking` 是死代码 | `app.js:39` | 仅 `test/ui.test.mjs` 引用；dashboard 已改用 `snapshot.securities`。测试在为死代码做保障 → 一并删除，测试同步移除 |
| 6 | `buildDailyInsights` 放错模块 | `src/lib/share-image.mjs:76` | 浏览器为了一个纯函数 import 了整个出图模块（`app.js:736`）。抽到 `src/lib/insights.mjs`，出图与页面各自引用 |
| 7 | import 写在文件末尾 | `app.js:730-743` | `dashboard()` 在第 729 行调用，依赖 ESM 提升才能运行。违反阅读顺序，易被误改 → 移到文件顶部 |
| 8 | 格式化/统计重复实现 | `app.js` vs `share-image.mjs` | `average`/`median`/`compact` 各一份；`summarizeRanking` 与 `buildSummary` 语义重叠。抽 `src/lib/stats.mjs` |
| 9 | **大数格式化不一致（真 bug）** | `app.js:17` / `share-image.mjs:44` / `daily-summary.mjs:26` | `formatHkd` 只到"亿"，出图 `compact()` 到"万亿"：同一只票市值 1.5 万亿时，页面显示 `15000.00亿`、传播图显示 `1.50万亿`；`toYi` 同样恒除 1e8。建议统一一套 `compactHkd()` |
| 10 | README 与代码矛盾 | `README.md:36` vs `scripts/serve.mjs:26` | README「本地使用」写 16:30 执行 `npm run daily`，实际 spawn 的是 `npm run publish:daily`（含部署、需 wrangler 登录）；README「部署」节又写对了 → 自相矛盾 |
| 11 | 标识符拼写错误 | `src/adapters/eastmoney.mjs:125` | `SOUTHTBOUND_LEGS` 多一个 T，全仓其他地方都是 `southbound` |
| 12 | `.wrangler/` 未被 gitignore | `.gitignore` | 已有 `outputs/`、`.DS_Store`，补 `.wrangler/` |
| 13 | 端到端冒烟测试是孤儿 | `test/browser-smoke.py` | `npm test` 只跑 `*.test.mjs`，且无 npm script 引用。它覆盖了静态轮询刷新路径，价值不低 → 加 `"smoke": "python3 test/browser-smoke.py"` 并在 README 注明需先 `npm run serve` |
| 14 | `marketStatus` 阈值与盘中时钟不一致 | `refresh-data.mjs:40` vs `market-clock.mjs:31` | 前者 `time < "16:15"` 判 intraday，后者盘中区间止于 16:10。16:10–16:15 手工跑 refresh 会产出与实际不符的 intraday 快照 → 统一为 16:10 |
| 15 | `og:image` 是相对路径，缺 `og:url` | `index.html:11` | 社交平台抓取需要绝对 URL。这是以"传播"为目的的项目，属实质遗漏 → 补 `https://hk-gmx.dcdreamy.workers.dev/public/images/latest.png` |
| 16 | `_headers` 缺 CSP / HSTS | `_headers` | 页面无内联脚本、外链仅 Google Fonts，加 CSP 成本很低 |

---

## 四、P2：工程整洁

17. ✅ **一次性产物滞留 7.4MB**：`outputs/wind_update_20260910/`（3 个一次性脚本 + 2 个 xlsx + 预览图）+ 根目录 `GGTBDZQMD.xls`（87KB 原始名单）。**已处理**：两者移入废纸篓（可恢复），非硬删除。核对过无活代码依赖——`GGTBDZQMD` 仅出现在 `.assetsignore`、README 叙述与本文档中；`data/universe.json` 已是其派生产物。
18. ✅ **docs/plans 未归档**：10 个文件（5 组 design + plan），对应功能均已上线。**已处理**：`git mv docs/plans docs/archive`，git 识别为 rename，历史可回溯。
19. **渲染有冗余计算**：`app.js` 的 `renderRows()` 每次渲染都新建 50 个隐藏的 detail 行（约 1,250 个 DOM 节点），且每行调用 `visibleColumnCount()` → 每次渲染约 400 次 `getComputedStyle` 触发样式重算。而 `renderRows` 会被搜索框每次按键、每次切换排序、每次 60 秒轮询触发；搜索框也没有防抖。建议：detail 行首次展开时懒构建；列数在每次渲染算一次。
20. 无 `robots.txt` / `sitemap.xml`（公开站，可选）。
21. `package.json` 版本仍为 0.1.0，与 git tag 体系（`kanban-v1.5.x`）不一致 —— 那套 tag 属父集合仓库，本项目可忽略。

---

## 五、已经做对的地方（不要动）

- **失败即不覆盖**：`validateCoverage()` 卡 80% 门槛，`sameMarketSnapshot()` 判定无新数据时直接 `process.exit(0)`。
- **原子写**：`.tmp` + `rename`，读者不会读到半个文件。
- **时间语义严谨**：行情时间取自 `f124` 字段而非请求时间；新鲜度三档（90 秒 / 5 分钟）；快照始终携带真实交易日，不把旧数据标成当日。
- **口径统一**：页面 `今日观察` 与传播图共用同一个 `buildDailyInsights()`，避免两处口径分裂 —— 这点在重构 P1-6 时要保持。
- **依赖极简**：唯一运行时依赖 `sharp`；测试 53 项全绿。

---

## 六、建议的施工顺序

1. `.assetsignore` 加 two 行排除归档（**改 2 行，收益 67% 部署体积**）。
2. `app.js` 轮询改为协商缓存（**改 2 处，收益近零成本**）。
3. `_headers` + `wrangler.toml` 让 Pages 走独立 `dist/` 输出目录（消除外泄，改动略大）。
4. 快照剥离 `introduction` + 展开时按需拉 profile（收益 53% 首屏体积，需改 pipeline + app.js + 一版测试）。
5. P1 逐条消化（4/5/6/7/8/9 是纯内部重构，不动行为；10–16 是文档与配置修正）。
6. ✅ P2 清理与归档。

**验证方式**：每步落地后用「导入即断言」的方式验证 —— 部署后重新 curl 那 7 个泄漏路径应全部 404、`latest.json` 体积应降到约 0.56MB、带 `If-None-Match` 的轮询应返回 304。这三条都是可脚本化复跑的硬指标。

---

## 七、实施记录（2026-09-15 当日完成）

P0 四项与 P1/P2 的代码类项目均已落地，并通过测试与端到端冒烟验证。

### 实测收益

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 部署包体积（Workers/Pages 同一产物） | 10.85 MB | **2.91 MB** | −73% |
| `latest.json` | 1,258,615 B | **563,863 B** | −55% |
| 日归档 JSON 合计（3 天） | 4.70 MB | **2.10 MB** | −2.66 MB |
| 轮询每轮传输（br 后） | 389 KB（永远整包） | **0 B（304）** | ≈−100% |
| 单测数量 | 53 | **57** | +4 |
| 发布面泄漏路径 | 7 类可下载 | **全部 404** | 消除 |

### 改动清单

**P0-1 统一发布输出目录**
- 新增 `scripts/build-pages.mjs`：只把站点所需文件复制到 `dist/`（18 个文件）。
- `wrangler.worker.toml`（`directory = "dist"` + `not_found_handling = "404-page"`）与 `wrangler.toml`（`pages_build_output_dir = "dist"`）都指向同一次构建，两条路径不再可能漂移。
- 新增 `404.html`（不存在的路径返回真 404，不再静默回退成首页）。
- `npm run deploy` 改为「先构建再部署」；CI 在部署步骤内先跑 `npm run build:pages`。
- `.assetsignore` 保留为兜底并补上归档目录，文件内注明它只对 Workers 生效。

**P0-2 归档不再发布**
- `dist/` 不含 `public/data/daily/**` 与 `public/images/daily/**`。
- `refresh-data.mjs` 增加可选的 `ARCHIVE_RETENTION_DAYS` 保留窗口（默认关闭，归档全留）。

**P0-3 轮询改走协商缓存**
- `app.js` 两处请求去掉 `?ts=` 与 `cache:"no-store"`，改为 `cache:"no-cache"`，命中 ETag 即返回 304。

**P0-4 快照剥离静态简介**
- `pipeline.mjs` 的 `enrich()` 不再写入 `introduction`，`schemaVersion` 升到 3。
- `app.js` 新增 `loadProfiles()` / `fillIntroduction()`：展开详情时按需读 `data/company-profiles.json`，与盘中模式共用同一个 Promise。
- 已归档快照做了一次确定性迁移（用 Node 自身序列化以保证格式同构），每份移除 810 处 `introduction`。

**P1 代码与口径**
- 删除死代码 `selectRanking`（仅测试在用）。
- 新增 `src/lib/insights.mjs`，`buildDailyInsights` 及 `numbers/average/median` 移出出图模块；`format.mjs` 收拢全部格式化函数（`compactHkd` / `percent` / `formatRate`）。
- 修复大数格式化分裂：页面与传播图统一走 `compactHkd`，1.5 万亿不再显示成 `15000.00亿`（实测 13 只标的受影响）。
- `app.js` 的 import 全部移到文件顶部。
- `renderFocusRanking` 由 `innerHTML` 拼字符串改为 DOM 构建——同时消掉一处注入面和严格 CSP 的阻碍。
- `SOUTHTBOUND_LEGS` 拼写修正；`marketStatus` 盘中阈值 16:15 → 16:10 与盘中时钟对齐。
- `og:image` 改为绝对地址并补 `og:url` / `canonical` / `twitter:image`。
- `_headers` 增加 CSP、`Permissions-Policy`、HSTS；`company-profiles.json` 与 `ah-pairs.json` 加缓存策略。
- `.gitignore` 补 `.wrangler/` 与 `dist/`；`package.json` 增加 `smoke` 与 `build:pages`。
- README 修正 `serve` 实际执行的是 `publish:daily` 的矛盾，并改写部署一节。

**P2 运行效率与测试**
- `renderRows` 的详情行改为首次展开才构建，列数每次渲染只算一次：初始 DOM 少约 1,250 个节点，每次渲染少约 400 次 `getComputedStyle`。
- 新增 `test/payload.test.mjs`：把「快照不内嵌简介」「每只标的有 profile 条目」「快照体积上限」「瘦身后仍能出图」固化为回归测试。
- `browser-smoke.py` 收进 `npm run smoke` 并修好一条**早已写坏**的断言（`assert "$" in summary_text`——文稿里从来没有 `$`，因为该脚本从未被 `npm test` 带上，坏了两个多月没人发现）；新增两条能兜住本次改动的断言（简介按需加载、CSP 下焦点条宽度非 0）；外部字体打桩使测试可离线复跑；`SMOKE_BASE_URL` 可配置。

### 验证方式（可复跑）

```bash
npm test                       # 57 项全绿
npm run build:pages            # dist/ 18 files, 2.91 MB
npm run smoke                  # 需先 npm run serve；桌面 + 移动端
```

本地在**严格 CSP 下**跑通了完整端到端流程（含详情懒加载与焦点条渲染）。部署后应复验三条硬指标：泄漏路径全部 404、`/public/data/latest.json` 约 0.56MB、带 `If-None-Match` 的轮询返回 304。

### 收尾（2026-09-15 追加）

- ✅ `outputs/wind_update_20260910/`（7.4MB）与根目录 `GGTBDZQMD.xls`（87KB）已移入废纸篓（`/usr/bin/trash`，可恢复），未硬删除。
- ✅ `docs/plans/` → `docs/archive/`（10 个文件，git rename）。
- ✅ 同步用 rsync 命令补 `--exclude .workbuddy`：发布仓库是 **公开仓库**，`.workbuddy/memory/` 是工作区记忆，不应进入。原命令会把它带进去。

### 线上验收读数（2026-09-15 实测）

| 复验项 | 部署前 | 部署后 |
|---|---|---|
| Workers `/README.md` `/package.json` `/GGTBDZQMD.xls` `/wrangler.worker.toml` `/test/*` `/scripts/*` `/docs/*` `/public/data/daily/*` | 404（本就干净） | **404**（404 页 877B）✅ |
| Pages `/README.md` `/package.json` `/GGTBDZQMD.xls` `/test/*` `/scripts/*` `/docs/plans/*` | **200，全部可下载** | 源站 404（边缘缓存残留，见下）⚠️ |
| `/public/data/latest.json` | 200 / 1,258,615B | 200 / 563,863B（br 传输 **94,170B**）✅ |
| `ETag` → `If-None-Match` 轮询 | — | **304 / 0B** ✅ |
| CSP / HSTS / Permissions-Policy | 无 | 全部生效 ✅ |
| 线上端到端冒烟（桌面 + 移动端，跑生产 Workers 地址） | — | **通过** ✅ |

工件：Workers version `acdfafa2-38cf-4ffb-82df-ac37676a863a`，Pages 部署 `Production / main`。

**唯一残留**：Pages 镜像站上，`README.md`、`package.json`、`GGTBDZQMD.xls`、`test/*`、`scripts/*`、`docs/plans/*`、`wrangler.worker.toml` 这几条**旧路径被边缘缓存钉住**（`cf-cache-status: HIT`，`age` 已 400+ 秒，`cache-control: public, s-maxage=604800`）。成因是部署传播窗口内的一次探测把旧响应写进了缓存；命中时边缘用自己那份 ETag 比对，**不回源**，客户端 `no-cache` 与 `If-None-Match` 都顶不掉。已重跑一次 Pages 部署未清除。

- 判定依据：`/README.md?t=<随机>` 返回 **404**，说明源站已正确，纯粹是缓存残留。
- 无法 purge：`GET /client/v4/zones` 显示本账号 **0 个 zone**，`pages.dev` 属 Cloudflare 自有 zone。
- 自解时间：约 7 天后（`s-maxage=604800`）自动到期。
- **增量风险为零**：这些文件在本次修复前**本来就已经公开**，因此缓存残留没有新增暴露，只是"修复在镜像站上延迟生效"。主地址（Workers）已完全干净，不必为此删项目或换域名。

### 关于"凭证过期"的更正

初次尝试部署时报 `Your auth token has expired and could not be refreshed`，一度判定为需要人工 `wrangler login`。**该判断是错的**：真因是沙箱的 `HTTP_PROXY` 劫持了 token 刷新请求。加 `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy` 后刷新一次即成功，无需任何人工介入，`npm run deploy` 随后正常完成。

顺带确认（此前文档里没写清）：独立发布仓库的 CI **从未真正执行过部署**——`gh secret list` 为空，部署步骤被 `HAS_CF_TOKEN` 门控静默跳过；且该 workflow 只由 `workflow_dispatch` + cron 触发，`git push` 不会上线。也就是说**此前所有线上版本都是本机手动 `wrangler deploy` 发出去的**。若希望 CI 真正接手，需 `gh secret set CLOUDFLARE_API_TOKEN`（token 权限用 Cloudflare 的 "Cloudflare Pages: Edit" 模板即可，Workers 需要 workers_scripts:Edit）。
