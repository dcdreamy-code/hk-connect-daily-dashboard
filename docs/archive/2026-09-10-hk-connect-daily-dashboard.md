# Hong Kong Connect Daily Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public, static Hong Kong Connect daily ranking dashboard with turnover, gainers, and losers Top 30 lists generated after market close.

**Architecture:** A Node.js data pipeline reads a versioned Hong Kong Connect universe, normalizes Eastmoney responses, validates coverage, and writes static JSON snapshots. A dependency-free HTML/CSS/JavaScript frontend reads `latest.json`; GitHub Actions refreshes and commits data after market close.

**Tech Stack:** Node.js 22, native `fetch`, Node test runner, HTML5, CSS, browser JavaScript, GitHub Actions, Vercel-compatible static hosting.

---

### Task 1: Project foundation and fixtures

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `data/universe.json`
- Create: `data/company-profiles.json`
- Create: `test/fixtures/eastmoney-quotes.json`

**Steps:**
1. Add scripts for tests, data refresh, validation, and local preview.
2. Convert the supplied workbook universe into normalized five-digit Hong Kong codes.
3. Convert cached Wind introductions into a keyed profile file and preserve missing values as `null`.
4. Add a deterministic Eastmoney response fixture for unit tests.
5. Validate JSON parsing and commit the foundation.

### Task 2: Data normalization and ranking with TDD

**Files:**
- Create: `test/pipeline.test.mjs`
- Create: `src/lib/pipeline.mjs`

**Steps:**
1. Write failing tests for quote normalization, universe filtering, ranking order, ties, missing numeric values, market summary, and coverage rejection.
2. Run `npm test` and confirm failures.
3. Implement pure functions with no network or filesystem dependencies.
4. Run `npm test` and confirm all tests pass.
5. Commit pipeline logic.

### Task 3: Eastmoney adapter and snapshot generator with TDD

**Files:**
- Create: `test/eastmoney.test.mjs`
- Create: `src/adapters/eastmoney.mjs`
- Create: `scripts/refresh-data.mjs`
- Create: `scripts/validate-data.mjs`

**Steps:**
1. Write failing adapter tests using injected fetch responses.
2. Implement timeout, response validation, retry, and normalized quote fetching.
3. Implement atomic daily/latest JSON writes and the non-overwrite coverage gate.
4. Add a schema-oriented validator for generated snapshots.
5. Run unit tests, then generate and validate a live snapshot.
6. Commit the data pipeline.

### Task 4: Static dashboard with TDD

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `test/ui.test.mjs`
- Create: `public/data/latest.json`

**Steps:**
1. Write failing tests for formatting, search, and ranking selection helpers.
2. Implement semantic HTML with status header, market summary, segmented ranking control, search, ranking table, detail expansion, loading, and error states.
3. Implement responsive CSS for desktop and mobile without nested cards or decorative marketing sections.
4. Run unit tests and start the local static server.
5. Commit the frontend.

### Task 5: Automation and documentation

**Files:**
- Create: `.github/workflows/refresh-dashboard.yml`
- Create: `README.md`
- Create: `vercel.json`

**Steps:**
1. Add a weekday post-close schedule and manual trigger.
2. Configure least-privilege repository content write permission and commit only changed snapshot files.
3. Document local refresh, validation, preview, deployment, source limits, and licensing boundary.
4. Run workflow syntax and project hygiene checks.
5. Commit automation and documentation.

### Task 6: End-to-end verification

**Files:**
- Modify only files required to fix verified defects.

**Steps:**
1. Run `npm test`, data validation, and a production-equivalent static preview.
2. Use Playwright at desktop and mobile widths to verify rendering, tabs, search, expansion, and error-free console output.
3. Check the dashboard canvas/screenshot is nonblank and no content overlaps or clips.
4. Review the scoped Git diff and ensure no secrets, generated support files, or unrelated changes are included.
5. Commit any verification fixes and leave the local preview server running.
