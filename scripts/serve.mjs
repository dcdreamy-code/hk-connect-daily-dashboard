import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { hongKongDate, localRefreshSlot } from "../src/lib/market-clock.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
};

const attemptedRefreshes = new Set();
let scheduledRefreshRunning = false;

function runDailyRefresh(key) {
  attemptedRefreshes.add(key);
  scheduledRefreshRunning = true;
  console.log(`[scheduler] Starting ${key} daily refresh.`);
  const child = spawn("npm", ["run", "publish:daily"], { cwd: root, env: process.env, stdio: "inherit" });
  child.on("error", (error) => {
    scheduledRefreshRunning = false;
    console.error(`[scheduler] Unable to start ${key}:`, error);
  });
  child.on("exit", (code, signal) => {
    scheduledRefreshRunning = false;
    if (code === 0) console.log(`[scheduler] Completed ${key} daily refresh.`);
    else console.error(`[scheduler] ${key} failed (${signal ?? `exit ${code}`}).`);
  });
}

function checkScheduledRefresh(now = new Date()) {
  const slot = localRefreshSlot(now);
  if (!slot || scheduledRefreshRunning) return;
  const key = `${hongKongDate(now)}:${slot}`;
  if (!attemptedRefreshes.has(key)) runDailyRefresh(key);
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("invalid path");
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": `${types[path.extname(filePath)] || "application/octet-stream"}; charset=utf-8` });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Dashboard: http://127.0.0.1:${port}`);
  checkScheduledRefresh();
  setInterval(checkScheduledRefresh, 30_000).unref();
}).on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Port ${port} is already served by another instance; nothing to do.`);
    process.exit(0);
  }
  throw error;
});
