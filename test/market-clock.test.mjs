import assert from "node:assert/strict";
import test from "node:test";
import {
  dataFreshness,
  hongKongDate,
  liveMarketPhase,
  localRefreshSlot,
  shouldRefreshAtClose,
  shouldRefreshLive,
} from "../src/lib/market-clock.mjs";

const hkTime = (iso) => new Date(iso);

test("liveMarketPhase recognizes Hong Kong trading windows", () => {
  assert.equal(liveMarketPhase(hkTime("2026-09-10T01:29:00Z")), "closed");
  assert.equal(liveMarketPhase(hkTime("2026-09-10T01:30:00Z")), "trading");
  assert.equal(liveMarketPhase(hkTime("2026-09-10T04:15:00Z")), "lunch");
  assert.equal(liveMarketPhase(hkTime("2026-09-10T05:00:00Z")), "trading");
  assert.equal(liveMarketPhase(hkTime("2026-09-10T08:10:00Z")), "closed");
  assert.equal(liveMarketPhase(hkTime("2026-09-12T02:00:00Z")), "closed");
});

test("shouldRefreshLive requires an active visible page and a one-minute stale interval", () => {
  const now = hkTime("2026-09-10T02:00:00Z");
  assert.equal(shouldRefreshLive({ now, enabled: true, visible: true, lastRefreshAt: 0 }), true);
  assert.equal(shouldRefreshLive({ now, enabled: false, visible: true, lastRefreshAt: 0 }), false);
  assert.equal(shouldRefreshLive({ now, enabled: true, visible: false, lastRefreshAt: 0 }), false);
  assert.equal(shouldRefreshLive({ now, enabled: true, visible: true, lastRefreshAt: now.getTime() - 59_000 }), false);
  assert.equal(shouldRefreshLive({ now, enabled: true, visible: true, lastRefreshAt: now.getTime() - 60_000 }), true);
});

test("shouldRefreshAtClose permits one final refresh after 16:10", () => {
  const now = hkTime("2026-09-10T08:12:00Z");
  assert.equal(hongKongDate(now), "2026-09-10");
  assert.equal(shouldRefreshAtClose({ now, enabled: true, visible: true, refreshedDate: null }), true);
  assert.equal(shouldRefreshAtClose({ now, enabled: true, visible: true, refreshedDate: "2026-09-10" }), false);
  assert.equal(shouldRefreshAtClose({ now: hkTime("2026-09-10T08:31:00Z"), enabled: true, visible: true, refreshedDate: null }), false);
  assert.equal(shouldRefreshAtClose({ now: hkTime("2026-09-12T08:12:00Z"), enabled: true, visible: true, refreshedDate: null }), false);
});

test("dataFreshness classifies quote age from the market timestamp", () => {
  const now = hkTime("2026-09-10T08:12:00Z");
  assert.deepEqual(dataFreshness(now.getTime() - 45_000, now), { state: "fresh", ageSeconds: 45 });
  assert.deepEqual(dataFreshness(now.getTime() - 120_000, now), { state: "delayed", ageSeconds: 120 });
  assert.deepEqual(dataFreshness(now.getTime() - 600_000, now), { state: "stale", ageSeconds: 600 });
  assert.deepEqual(dataFreshness(null, now), { state: "unknown", ageSeconds: null });
});

test("localRefreshSlot supports a primary run, fallback run, and startup catch-up", () => {
  assert.equal(localRefreshSlot(hkTime("2026-09-10T08:29:00Z")), null);
  assert.equal(localRefreshSlot(hkTime("2026-09-10T11:00:00Z")), "evening");
  assert.equal(localRefreshSlot(hkTime("2026-09-10T10:59:00Z")), "fallback");
  assert.equal(localRefreshSlot(hkTime("2026-09-10T08:30:00Z")), "primary");
  assert.equal(localRefreshSlot(hkTime("2026-09-10T08:44:00Z")), "primary");
  assert.equal(localRefreshSlot(hkTime("2026-09-10T08:45:00Z")), "fallback");
  assert.equal(localRefreshSlot(hkTime("2026-09-10T12:00:00Z")), "evening");
  assert.equal(localRefreshSlot(hkTime("2026-09-12T08:45:00Z")), null);
});
