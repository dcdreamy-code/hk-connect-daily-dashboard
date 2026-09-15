# Market Cap, AH Badge, and Share Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add total market cap, turnover rate, amplitude, AH metadata, and a daily 1600 x 2400 PNG to the Hong Kong Connect Top 50 dashboard.

**Architecture:** Extend the normalized quote model and add an AH comparison adapter, then enrich snapshots before the frontend renders them. Generate the share image from the validated turnover ranking using a deterministic SVG layout rendered to PNG with Sharp.

**Tech Stack:** Node.js 22, native fetch, Node test runner, HTML/CSS/JavaScript, Sharp, GitHub Actions.

---

### Task 1: Extend quote and AH data models

**Files:**
- Modify: src/lib/pipeline.mjs
- Modify: src/adapters/eastmoney.mjs
- Modify: test/pipeline.test.mjs
- Modify: test/eastmoney.test.mjs

**Steps:**
1. Add failing tests for marketCap, turnoverRate, amplitude, AH mapping, and enrichment.
2. Run npm test and confirm RED.
3. Extend quote normalization and implement paginated AH comparison fetching.
4. Enrich snapshot records with AH metadata.
5. Run npm test and confirm GREEN.

### Task 2: Extend daily and intraday refresh

**Files:**
- Modify: scripts/refresh-data.mjs
- Modify: scripts/validate-data.mjs
- Modify: app.js
- Create: public/data/ah-pairs.json
- Modify: .github/workflows/refresh-dashboard.yml

**Steps:**
1. Fetch AH mappings during daily refresh and write them atomically.
2. Merge cached AH mappings into browser intraday snapshots.
3. Validate new numeric fields and AH structure.
4. Regenerate the live snapshot and verify representative mappings for ICBC and CATL.

### Task 3: Update dashboard UI

**Files:**
- Modify: index.html
- Modify: styles.css
- Modify: app.js
- Modify: test/ui.test.mjs
- Modify: test/browser-smoke.py

**Steps:**
1. Add failing summary tests for average/median market cap and AH counts.
2. Add table columns, AH badge, AH detail section, and AH-only filter.
3. Keep mobile columns compact and move secondary fields into expanded details.
4. Verify desktop and mobile interactions with Playwright.

### Task 4: Generate the daily share image

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Create: src/lib/share-image.mjs
- Create: scripts/render-share-image.mjs
- Create: test/share-image.test.mjs
- Create: public/images/latest.png
- Create: public/images/daily/YYYY-MM-DD.png

**Steps:**
1. Add Sharp and write failing SVG model tests.
2. Implement a deterministic 1600 x 2400 two-column SVG.
3. Render PNG atomically after validating latest.json.
4. Verify dimensions, nonblank pixels, 50 entries, market cap, and AH badges.
5. Add image generation to the scheduled workflow.

### Task 5: Documentation and final verification

**Files:**
- Modify: README.md

**Steps:**
1. Document new fields, AH methodology, and image commands/outputs.
2. Run npm test, npm run refresh, npm run validate, and npm run image.
3. Run desktop/mobile/mobile browser checks and inspect the generated PNG.
4. Check the scoped diff and commit the implementation.
