# 港美侠个人投研日报改版 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将网页与传播图统一改造成具有“港美侠”作者识别的专业财经编辑式数据日报。

**Architecture:** 保留原生 HTML、CSS 和 JavaScript 数据逻辑，只重组展示层和确定性观察文案。桌面与移动端共享语义结构，通过响应式列裁剪和详情展开满足不同阅读密度；传播图复用同一品牌标识与数据观察函数。

**Tech Stack:** HTML5、CSS、原生 JavaScript ES modules、SVG/Sharp、Node.js test runner、Playwright。

---

### Task 1: 品牌与信息架构

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `test/ui.test.mjs`

1. 添加失败测试，要求页面包含“港美侠”“港股通每日资金榜”和今日观察结构。
2. 运行 `node --test test/ui.test.mjs`，确认失败。
3. 重组刊头、观点区、核心数据带和榜单工具栏，并从快照生成可追溯的主判断与三条观察。
4. 运行目标测试并确认通过。
5. 提交结构改动。

### Task 2: 专业编辑式响应布局

**Files:**
- Modify: `styles.css`
- Modify: `test/browser-smoke.py`

1. 更新浏览器断言，覆盖品牌首屏、移动端四列榜单和无横向溢出。
2. 以纸白、墨黑、中性灰和铜金为基础重写展示样式，取消网格背景与同质卡片。
3. 桌面端强化连续数据带与表格；移动端仅显示排名、证券、涨跌幅和成交额。
4. 运行桌面和移动端浏览器测试。
5. 提交样式改动。

### Task 3: 传播图品牌统一

**Files:**
- Modify: `src/lib/share-image.mjs`
- Modify: `test/share-image.test.mjs`
- Regenerate: `public/images/latest.png`
- Regenerate: `public/images/daily/2026-09-11.png`

1. 添加失败测试，要求 SVG 出现“港美侠”“港股通每日资金榜”和“港美侠出品”。
2. 更新图片刊头、栏目名称、品牌署名和编辑式配色，不改变 Top 50 字段口径。
3. 运行图片测试并生成 PNG。
4. 检查图片尺寸、非空像素和实际视觉效果。
5. 提交传播图改动。

### Task 4: 完整验收

1. 运行 `npm test`、`npm run validate` 和 `npm run image`。
2. 运行 Playwright 桌面与移动端冒烟测试并查看截图。
3. 检查首页、快照和传播图 HTTP 响应。
4. 运行 `git diff --check`，确认只保留用户原有未跟踪 Excel。
