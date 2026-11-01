import { spawn } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "/tmp/mw-shots";
const debugPort = process.env.CHROME_PORT || "9334";

let chrome = null;
if (!process.env.CHROME_PORT) {
  chrome = spawn(
    "/usr/bin/google-chrome-stable",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=/tmp/chrome-mw-capture",
      "--remote-debugging-port=" + debugPort,
      "--window-size=1920,1080",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitJson(url) {
  const start = Date.now();
  let last;
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      last = res.status;
    } catch (err) {
      last = err.message;
    }
    await sleep(200);
  }
  throw new Error("debugger not ready: " + last);
}

const pending = new Map();
let socket;
let seq = 0;

function send(method, params = {}, sessionId) {
  const id = ++seq;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify(payload));
  });
}

const version = await waitJson("http://127.0.0.1:" + debugPort + "/json/version");
socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve);
  socket.addEventListener("error", () => reject(new Error("websocket failed")));
});
socket.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

const created = await send("Target.createTarget", { url: base });
const attached = await send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
const sessionId = attached.sessionId;
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false },
  sessionId
);

async function evaluate(expression) {
  const result = await send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function waitForPaint() {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const ready = await evaluate(`(() => {
      const price = document.querySelector('[data-quote="bayn"] .q-price');
      const stage = document.getElementById('stage');
      return !!(price && stage && stage.classList.contains('ready') && price.textContent && price.textContent !== '—');
    })()`);
    if (ready) return;
    await sleep(200);
  }
  throw new Error("page did not render quotes");
}

await waitForPaint();
await sleep(300);

const report = await evaluate(`(() => {
  const now = new Date();
  const clocks = Array.from(document.querySelectorAll('.clock')).map((node) => {
    const tz = node.dataset.tz;
    const market = node.dataset.market;
    const shown = node.querySelector('.time').textContent;
    const badge = node.querySelector('.badge').textContent;
    const expectedTime = MarketHours.formatClock(now, tz);
    const earlier = MarketHours.formatClock(new Date(now.getTime() - 1500), tz);
    const expectedBadge = MarketHours.badge(market, now).text;
    return {
      city: node.querySelector('.city').textContent,
      tz, market, shown, badge, expectedTime, earlier, expectedBadge,
      timeOk: shown === expectedTime || shown === earlier,
      badgeOk: badge === expectedBadge,
    };
  });
  const prices = {};
  for (const id of ['bayn', 'bayry', 'wmt']) {
    const card = document.querySelector('[data-quote="' + id + '"]');
    prices[id] = {
      price: card.querySelector('.q-price').textContent,
      change: card.querySelector('.q-chg').textContent,
      atClose: !card.querySelector('.at-close').hidden,
      open: MarketHours.isOpen(id === 'bayn' ? 'xetra' : 'us', now),
    };
  }
  return {
    clocks,
    prices,
    status: document.getElementById('status').textContent,
    title: document.getElementById('hl-title').textContent,
    headlines: Array.from(document.querySelectorAll('.hl-title')).map((n) => n.textContent),
    ticker: document.getElementById('ticker').textContent,
    refreshMs: document.documentElement.dataset.refreshMs,
    rotateMs: document.documentElement.dataset.rotateMs,
    stage: {
      w: document.getElementById('stage').offsetWidth,
      h: document.getElementById('stage').offsetHeight,
    },
  };
})()`);

const failures = [];
for (const clock of report.clocks) {
  if (!clock.timeOk) failures.push(clock.city + " time " + clock.shown + " != " + clock.expectedTime);
  if (!clock.badgeOk) failures.push(clock.city + " badge " + clock.badge + " != " + clock.expectedBadge);
}
if (report.prices.bayn.atClose !== !report.prices.bayn.open) failures.push("bayn at-close mismatch");
if (report.prices.wmt.atClose !== !report.prices.wmt.open) failures.push("wmt at-close mismatch");
const market = JSON.parse(readFileSync(new URL("../data/market.json", import.meta.url), "utf8"));
const expected = {
  quotes: Object.fromEntries(
    ["bayn", "bayry", "wmt"].map((id) => [
      id,
      {
        price: market.quotes[id].price,
        currency: market.quotes[id].currency,
        digits: market.quotes[id].digits,
        changePct: market.quotes[id].changePct,
      },
    ])
  ),
  spx: market.ticker.sp500.price,
  spxDigits: market.ticker.sp500.digits,
  fx: market.ticker.eurusd.price,
  fxDigits: market.ticker.eurusd.digits,
};
const compared = await evaluate(`(() => {
  const expected = ${JSON.stringify(expected)};
  const problems = [];
  function money(value, currency, digits) {
    const formatted = Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return (currency === "EUR" ? "€" : "$") + formatted;
  }
  function plain(value, digits) {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  for (const id of Object.keys(expected.quotes)) {
    const quote = expected.quotes[id];
    const shown = document.querySelector('[data-quote="' + id + '"] .q-price').textContent;
    const want = money(quote.price, quote.currency, quote.digits);
    if (shown !== want) problems.push(id + " price " + shown + " != " + want);
    const change = document.querySelector('[data-quote="' + id + '"] .q-chg').textContent;
    if (!change.includes(Math.abs(quote.changePct).toFixed(2))) problems.push(id + " pct " + change);
  }
  const ticker = document.getElementById("ticker").textContent;
  if (!ticker.includes(plain(expected.spx, expected.spxDigits))) problems.push("spx " + ticker);
  if (!ticker.includes(plain(expected.fx, expected.fxDigits))) problems.push("fx " + ticker);
  return problems;
})()`);
failures.push(...compared);
if (report.refreshMs !== "60000") failures.push("refresh interval");
if (report.rotateMs !== "12000") failures.push("rotate interval");
if (report.headlines.length < 1) failures.push("no headlines");
if (!report.status.includes("Quotes delayed 15 min")) failures.push("delay note " + report.status);
if (report.stage.w !== 1920 || report.stage.h !== 1080) failures.push("stage size " + report.stage.w + "x" + report.stage.h);

const stale = await evaluate(`(async () => {
  const before = document.querySelector('[data-quote="bayn"] .q-price').textContent;
  const orig = window.fetch;
  window.fetch = () => Promise.reject(new Error('offline'));
  await window.MarketWatch.refresh();
  const after = document.querySelector('[data-quote="bayn"] .q-price').textContent;
  const status = document.getElementById('status').textContent;
  const marked = document.getElementById('status').classList.contains('stale');
  window.fetch = orig;
  await window.MarketWatch.refresh();
  const restored = document.getElementById('status').classList.contains('stale');
  return { before, after, status, marked, restored };
})()`);
if (stale.before !== stale.after) failures.push("price changed during failed refresh");
if (!stale.marked || !stale.status.includes("Stale")) failures.push("stale indicator missing " + stale.status);
if (stale.restored) failures.push("stale indicator stuck after recovery");

await evaluate(`document.querySelector('[data-tab="walmart"]').click()`);
await sleep(400);
const walmartTab = await evaluate(`document.getElementById('hl-title').textContent`);
if (walmartTab !== "HEADLINES · WALMART") failures.push("tab switch " + walmartTab);
await evaluate(`window.MarketWatch.showTab('bayer', false)`);

async function shoot(name, width, height) {
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await evaluate(`window.MarketWatch.fit()`);
  await sleep(250);
  const metrics = await evaluate(`(() => {
    const stage = document.getElementById('stage');
    const rect = stage.getBoundingClientRect();
    return { iw: window.innerWidth, ih: window.innerHeight, sw: Math.round(rect.width), sh: Math.round(rect.height) };
  })()`);
  const scale = Math.min(width / 1920, height / 1080);
  const expectW = Math.round(1920 * scale);
  const expectH = Math.round(1080 * scale);
  if (Math.abs(metrics.sw - expectW) > 2 || Math.abs(metrics.sh - expectH) > 2) {
    failures.push(name + " scale " + JSON.stringify(metrics) + " expected " + expectW + "x" + expectH);
  }
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  const file = outDir + "/" + name + ".png";
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log("wrote", file, metrics.iw + "x" + metrics.ih);
}

await shoot("market-watch-1920x1080", 1920, 1080);
await evaluate(`window.MarketWatch.showTab('top', false)`);
await shoot("market-watch-top-stories-1920", 1920, 1080);
await evaluate(`window.MarketWatch.showTab('bayer', false)`);
await shoot("market-watch-1280x720", 1280, 720);

console.log(JSON.stringify({ clocks: report.clocks, prices: report.prices, status: report.status, ticker: report.ticker, walmartTab, stale }, null, 2));
if (failures.length) {
  console.error("FAILURES");
  for (const failure of failures) console.error(" -", failure);
  if (chrome) chrome.kill();
  process.exit(1);
}
console.log("capture ok");
if (chrome) chrome.kill();
process.exit(0);
