# 港股通看板准实时刷新与收盘可靠性 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将盘中榜单升级为一分钟级准实时刷新，并补齐行情新鲜度、收盘末次刷新和自动任务兜底。

**Architecture:** 保持纯静态前端和东方财富直连，不引入常驻后端。市场时钟模块负责交易阶段、数据年龄与收盘末次刷新判定，页面状态机负责轮询和容错，GitHub Actions 负责正式收盘快照的两次计划执行。

**Tech Stack:** 原生 JavaScript ES modules、Node.js 22 test runner、GitHub Actions、静态 HTML/CSS。

---

### Task 1: 市场时钟与数据新鲜度

**Files:**
- Modify: `src/lib/market-clock.mjs`
- Modify: `test/market-clock.test.mjs`

**Step 1:** 添加失败测试，覆盖 60 秒刷新周期、16:10 后单次末次刷新，以及基于行情时间戳的新鲜度等级。

**Step 2:** 运行 `node --test test/market-clock.test.mjs`，确认新增断言失败。

**Step 3:** 实现最小的刷新判定和数据年龄函数，保证跨午休和跨日期行为明确。

**Step 4:** 再次运行目标测试并确认通过。

**Step 5:** 提交市场时钟改动。

### Task 2: 页面刷新状态机

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `test/ui.test.mjs`

**Step 1:** 添加失败测试，要求页面具备行情时间、数据年龄和延迟状态元素，并验证末次刷新状态调用。

**Step 2:** 运行 `node --test test/ui.test.mjs`，确认新增测试失败。

**Step 3:** 将轮询间隔改为 60 秒；基于行情 `timestamp` 渲染更新时间和新鲜度；交易结束后只尝试一次末次刷新；失败时保留旧榜单。

**Step 4:** 运行 UI 与市场时钟测试并确认通过。

**Step 5:** 提交页面刷新改动。

### Task 3: 收盘任务兜底与文档

**Files:**
- Modify: `.github/workflows/refresh-dashboard.yml`
- Modify: `README.md`

**Step 1:** 将定时计划扩展为香港时间 16:30 和 16:45 两次执行，并记录去重行为。

**Step 2:** 更新 README 的一分钟刷新、末次刷新、数据新鲜度和独立仓库启用条件。

**Step 3:** 检查 YAML 和文档 diff，确认没有扩大授权或引入付费依赖。

**Step 4:** 提交自动任务与文档改动。

### Task 4: 完整验证

**Files:**
- Verify: `test/*.test.mjs`
- Verify: `public/data/latest.json`
- Verify: `public/images/latest.png`

**Step 1:** 运行 `npm test`。

**Step 2:** 运行 `npm run validate` 和 `npm run image`。

**Step 3:** 启动或复用本地服务，检查首页、正式快照和传播图响应。

**Step 4:** 检查 `git diff --check` 与工作区状态，仅保留用户原有未跟踪文件。
