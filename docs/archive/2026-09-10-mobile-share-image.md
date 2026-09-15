# Mobile Share Image Implementation Plan

**Goal:** Replace the desktop-style two-column image with a single-column 1242 × 4200 mobile market report.

**Architecture:** Derive a deterministic insight model from the turnover Top 50, render it into a single-column SVG, and use the existing Sharp pipeline for atomic PNG output.

**Tech Stack:** Node.js 22, SVG, Sharp, Node test runner, Pillow verification.

## Tasks

1. Add failing tests for image dimensions, deterministic insight text, 50 rows, AH badges, and required metrics.
2. Implement reusable insight calculation and the 1242 × 4200 one-column SVG.
3. Update PNG dimension checks, documentation, and browser download expectations.
4. Run the daily pipeline, unit tests, image pixel checks, and visually inspect the final PNG.
