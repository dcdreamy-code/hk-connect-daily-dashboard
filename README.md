# 港美侠 · 港股通每日资金榜

港美侠出品的免费、公开、只读数据看板，展示港股通标的成交额、涨幅和跌幅 Top 50。

## 功能

- 成交额、涨跌幅两个方向维度加总市值、换手率，每榜最多 50 只。
- 港股通标的涨跌家数、港股通标的总成交额（660 只标的在全市场的成交合计，所有买卖方参与；并非南向通道成交额）和数据覆盖率。
- 当前 Top 50 的成交额平均值/中位数、涨跌幅平均值/中位数、涨跌家数和涨跌幅范围。
- 总市值、换手率、振幅，以及 Top 50 市值平均值和中位数。
- 成交额榜提供持续性标识："新进"与连续上榜天数，详情展开含上一交易日排名和成交额较 5 日均值。
- AH 两地上市标识、A 股代码、两地涨跌幅和 AH 溢价率。
- 可从全部已匹配的港股通标的中，按成交额、涨跌幅、总市值或换手率升序/降序取 Top 50。
- 搜索覆盖全部已匹配标的，不限于当前 Top 50；“仅看 AH”会先过滤再排序。
- 每日自动生成一张适合传播的成交额 Top 50 PNG。
- 代码/名称搜索，点击行展开公司简介。
- 桌面和移动端响应式布局。
- 可选盘中刷新：用户主动开启后，在港股交易时段每 1 分钟更新一次。
- 每个交易日收盘后自动更新，也可以在 GitHub Actions 手动触发。

## 本地使用

需要 Node.js 22 或更高版本。

```bash
npm test          # 单元测试
npm run refresh   # 抓行情、生成快照
npm run validate  # 校验快照
npm run image     # 生成传播图
npm run daily     # 上面四步一次跑完
npm run serve     # 本地预览 http://127.0.0.1:4173
npm run smoke     # 浏览器端到端冒烟（需先 npm run serve）
```

打开 `http://127.0.0.1:4173`。

本地服务器保持运行时，会在工作日中国时间 `16:30` 自动执行 `npm run publish:daily`（刷新 + 校验 + 出图 + 发布两个地址），`16:45` 再提供一次失败兜底。因此本地定时发布需要先 `wrangler login`；只想刷新数据、不发布，就用 `npm run daily`。如果在 `16:30` 之后启动服务器，会立即执行当前时间对应的收盘任务。服务器关闭或电脑休眠期间无法执行本地任务。

`npm run smoke` 需要 Playwright 与 Pillow，默认访问 `127.0.0.1:4173`，可用 `SMOKE_BASE_URL` 指向其他地址。

## 数据流程

1. `data/universe.json` 定义港股通股票池，`type` 字段来自官方名单"品种"列（660 只股票 + 31 只 ETF）；榜单、市场统计和覆盖率的计算口径只含股票（`type: security`），港股通 ETF 不参与排名。
2. `src/adapters/eastmoney.mjs` 按股票池分批获取东方财富延时港股行情（每批 200 只，含行业字段），不拉取股票池以外的港股。
3. `scripts/refresh-data.mjs` 与股票池求交集，验证至少 80% 覆盖率，计算榜单；同时读取最近 5 个交易日的归档，计算连续上榜天数、上一交易日排名和 5 日成交额均值。
4. AH 对应关系低频写入 `public/data/ah-pairs.json`，日常行情刷新只读取该缓存。
5. 日快照写入 `public/data/daily/YYYY-MM-DD.json`，最新快照原子写入 `public/data/latest.json`。
6. 快照不内嵌公司简介等静态长文本。简介曾同时写进 660 只证券和三个榜单（每份快照重复约 810 处、占体积 53%），现在改为页面展开某行详情时才按需读取 `data/company-profiles.json`。
7. 页面默认只读取本地 JSON；用户主动开启盘中刷新后，浏览器才请求第三方行情。
8. 页面每 60 秒以条件请求复查一次 `latest.json`。快照未变时服务端返回 304，正文不重新传输（此前用时间戳参数击穿缓存，每次都要整包重下）。
9. `npm run image` 生成 `public/images/latest.png` 和按交易日归档图片。

归档默认全部保留（Git 历史本身有价值，且它们不再被发布）。若工作区体积需要控制，刷新时设 `ARCHIVE_RETENTION_DAYS=60`，只保留最近 60 个交易日的快照与图片。

## 传播图片

页面提供“下载传播图”入口。图片版面固定为 1242 x 3660 逻辑尺寸，默认以 2 倍分辨率（2484 x 7320）导出 PNG 以保证手机端文字清晰，可用 `SHARE_IMAGE_SCALE` 环境变量调整倍率。图片使用成交额 Top 50 名单，采用移动端单栏布局，展示涨跌幅、成交额、总市值、换手率和 AH 标识。字段名称只在表头出现一次，每 10 行使用分隔线辅助定位。顶部的“今日观察”和三条亮点由当日数据规则生成，不推测涨跌原因。

- 最新图片：`public/images/latest.png`
- 每日归档：`public/images/daily/YYYY-MM-DD.png`

`npm run daily` 会一次完成行情刷新、数据校验和传播图生成。

## 盘中刷新

页面顶部的“盘中刷新”默认关闭。用户开启后，页面按港股通股票池每 200 只分批获取行情，并在以下时段每 1 分钟刷新：

- 09:30–12:00
- 13:00–16:10

页面进入后台或午间休市时会暂停请求。16:10 后会执行一次收盘末次刷新，然后停止盘中请求。刷新失败时保留最后一次成功榜单，不显示空数据；关闭开关会恢复 latest.json 中的正式快照。开关选择保存在当前浏览器。

页面同时显示行情记录自身的时间，而不是仅显示网页请求时间。盘中行情在 90 秒内标记为新鲜，90 秒至 5 分钟标记为延迟，超过 5 分钟标记为滞后。

盘中模式直接使用东方财富网页行情接口，只适合低流量的个人非商业原型。该接口没有第三方开发者 SLA，也不能据其域名判断为已获得公开转发行情的授权。正式公开推广或商业使用前，应切换至具有相应展示许可的数据源。

## 自动更新

`.github/workflows/refresh-dashboard.yml` 在工作日 `08:30 UTC` 和 `08:45 UTC`（中国时间 `16:30` 和 `16:45`）执行。第一次生成正式收盘数据，第二次作为接口瞬时失败或数据尚未完整时的兜底。任务会运行测试、更新和校验，然后仅提交变化的快照文件；内容没有变化时不会创建提交。快照确有变化时，部署步骤会先 `npm run build:pages` 再推送两个地址。

本地运行不依赖 GitHub Actions：`npm run serve` 内置相同的 `16:30` 主任务和 `16:45` 兜底任务。公开部署仍应使用 GitHub Actions 或等价的服务端计划任务，不能依赖访问者浏览器保持打开。

AH 身份映射不随日行情重复请求。`.github/workflows/refresh-ah.yml` 每月 1 日更新一次，也可用 `npm run refresh:ah` 手动更新。

传播图的榜单口径始终固定为成交额从高到低 Top 50，不受页面中的手动排序选择影响。

当前目录处于集合仓库内。GitHub Actions 与公开托管均以独立仓库（`hk-connect-daily-dashboard`）为准，同步方式见"部署"一节。

## 部署

公开部署在 Cloudflare 双地址：

- **主地址（中国大陆可正常打开）**：https://hk-gmx.dcdreamy.workers.dev —— Workers 静态资产
- **备用地址**：https://hk-gmx.pages.dev —— Pages 项目，海外访问备用

两个地址发布的是**同一个构建产物**：`npm run build:pages` 生成的 `dist/`。`wrangler.worker.toml` 与 `wrangler.toml` 都指向它，`npm run deploy` 会先构建再部署。

这样做是有原因的：`.assetsignore` **只对 Workers Static Assets 生效，Pages 直传不读它**。此前 Pages 直接把仓库根当发布目录，结果 `README.md`、`docs/plans/*.md`、`scripts/`、`test/`、`package.json`、`GGTBDZQMD.xls` 全部可被公网下载，而 Workers 同路径是 404——两条路径的内容其实并不一致。改走 `dist/` 后，发布面只由 `scripts/build-pages.mjs` 里那份清单决定。

`dist/` **不包含** `public/data/daily/**` 与 `public/images/daily/**`：这些归档只被服务端刷新脚本读取（Git 检出里就有），页面从不请求。此前它们随站发布，占部署体积约三分之二，且每交易日再增约 2.8MB。

三条发布路径互为冗余（每次同时更新两个地址）：

- **手动发布**：`npm run deploy`（依赖本机 `wrangler login`）。
- **本地定时发布**：`npm run serve` 会在工作日 16:30/16:45 执行 `publish:daily`（刷新 + 校验 + 出图 + 部署）。
- **CI 自动发布**：在 GitHub 仓库配置 `CLOUDFLARE_API_TOKEN` secret（Cloudflare Dashboard → My Profile → API Tokens，权限用 "Cloudflare Pages: Edit" 模板）后，每日收盘工作流在提交快照后会自动构建并部署；未配置该 secret 时此步骤自动跳过，不影响数据刷新。

`*.workers.dev` 与 `*.pages.dev` 的可达性因地区运营商而异，以实测为准；正式传播建议绑定自有域名（免费版支持，无需改代码）。根目录 `_headers` 提供安全响应头（含 CSP）与缓存策略，并对 `latest.json` 与传播图设置不缓存，读者始终拿到最新收盘数据。`404.html` 让不存在的路径返回真正的 404，而不是静默回退成首页。

> 改完发布相关配置后，验收方式是直接打线上路径：那些不该公开的文件应全部返回 404，`/public/data/latest.json` 应保持在约 0.6MB 以内。

### 与工作台同步

本目录处于集合仓库内，开发与验证在这里进行；发布以独立仓库为准。数据快照由独立仓库内的 Actions 自动生成，日常只需在代码改动后同步一次：

```bash
rsync -av --delete --exclude node_modules --exclude outputs --exclude dist --exclude .wrangler \
  --exclude .workbuddy --exclude .DS_Store --exclude .git \
  "projects/港股通/" ~/Projects/hk-connect-daily-dashboard/
cd ~/Projects/hk-connect-daily-dashboard && git add -A && git commit -m "sync from workspace" && git push
```

独立仓库是**公开仓库**，所以 `--exclude .workbuddy` 不能省：那是工作区记忆目录，属本地笔记，不应随源码发布。注意 `git push` 只同步代码——该仓库的 workflow 由 `workflow_dispatch` 与 cron 触发，不接受 push 触发，发布仍需 `npm run deploy` 或一次手动 dispatch。

## 数据与授权说明

- 行情来自东方财富网页延时行情接口，该接口不是面向第三方开发者承诺的免费公开 API，可能变更或限流。
- 公司简介为低频静态资料，来自本项目已获取的 Wind 数据；行业板块名称来自东方财富行情字段，缺失值保留为空。
- 项目仅适用于个人、免费、非商业原型。公开转发行情数据可能涉及东方财富和香港交易所的授权条款；商业化、扩大数据范围或提供实时行情前，必须切换至获得展示和转发授权的数据源。

## 失败策略

- 东方财富请求超时或失败时，每页最多重试一次。
- 响应结构异常或股票池覆盖率低于 80% 时，任务失败且不覆盖旧数据。
- 页面始终展示快照的真实交易日期，不把旧数据标成当日数据。
