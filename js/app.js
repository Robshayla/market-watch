(function () {
  "use strict";

  var REFRESH_MS = 60000;
  var ROTATE_MS = 12000;
  var STORE_KEY = "mw-last-good-v1";
  var RELOAD_KEY = "mw-nightly-reload";
  var TABS = ["bayer", "walmart", "nvidia", "top"];
  var TAB_NAME = { bayer: "BAYER", walmart: "WALMART", nvidia: "NVIDIA", top: "TOP STORIES" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var stage = document.getElementById("stage");
  var list = document.getElementById("hl-list");
  var title = document.getElementById("hl-title");
  var statusEl = document.getElementById("status");
  var tickerEl = document.getElementById("ticker");
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll(".tabs button"));
  var clockNodes = Array.prototype.slice.call(document.querySelectorAll(".clock"));
  var cards = {
    bayn: document.querySelector('[data-quote="bayn"]'),
    bayry: document.querySelector('[data-quote="bayry"]'),
    wmt: document.querySelector('[data-quote="wmt"]'),
    nvda: document.querySelector('[data-quote="nvda"]'),
  };

  var eventEl = document.getElementById("event");
  var resultsEl = document.getElementById("results-screen");
  var reactionEl = document.getElementById("reaction-screen");
  var consumerEl = document.getElementById("consumer-screen");
  var earningsDoc = null;
  var screenTimer = 0;
  var screenIndex = 0;
  var data = null;
  var eventsConfig = { events: [] };
  var eventModel = null;
  var eventSignature = "";
  var tab = initialTab();
  var rotateTimer = 0;
  var fadeToken = 0;
  var refreshTimer = 0;
  var fetchFailed = false;

  document.documentElement.dataset.refreshMs = String(REFRESH_MS);
  document.documentElement.dataset.rotateMs = String(ROTATE_MS);

  function initialTab() {
    var params;
    try {
      params = new URLSearchParams(location.search);
    } catch (err) {
      return "bayer";
    }
    var requested = params.get("tab");
    return TABS.indexOf(requested) >= 0 ? requested : "bayer";
  }

  function fit() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = "scale(" + scale + ")";
    stage.style.left = (window.innerWidth - 1920 * scale) / 2 + "px";
    stage.style.top = (window.innerHeight - 1080 * scale) / 2 + "px";
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore(payload) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* Private mode or a full store should not blank the screen. */
    }
  }

  function direction(change) {
    if (change > 0) return "up";
    if (change < 0) return "down";
    return "flat";
  }

  function money(value, currency, digits) {
    var formatted = Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    if (currency === "EUR") return "€" + formatted;
    return "$" + formatted;
  }

  function signed(value, digits) {
    var n = Number(value);
    var body = Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    if (n > 0) return "+" + body;
    if (n < 0) return "−" + body;
    return body;
  }

  function percent(value) {
    var n = Number(value);
    var body = Math.abs(n).toFixed(2) + "%";
    if (n > 0) return "+" + body;
    if (n < 0) return "−" + body;
    return body;
  }

  function arrow(dir) {
    if (dir === "flat") return null;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("class", "arrow" + (dir === "down" ? " down" : ""));
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M6 1.2 L11 10.8 H1 Z");
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
  }

  function sparkline(values, dir, id) {
    var nums = [];
    for (var i = 0; i < values.length; i++) {
      var n = Number(values[i]);
      if (isFinite(n)) nums.push(n);
    }
    if (nums.length === 1) nums.push(nums[0]);
    if (nums.length < 2) return null;
    var min = nums[0];
    var max = nums[0];
    for (var j = 1; j < nums.length; j++) {
      if (nums[j] < min) min = nums[j];
      if (nums[j] > max) max = nums[j];
    }
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * 0.14;
    min -= pad;
    max += pad;
    var width = 1000;
    var height = 150;
    var coords = [];
    for (var k = 0; k < nums.length; k++) {
      var x = (k / (nums.length - 1)) * width;
      var y = height - ((nums[k] - min) / (max - min)) * (height - 16) - 6;
      coords.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    var line = coords.join(" ");
    var color = dir === "up" ? "#22d36b" : dir === "down" ? "#ff4d4f" : "#8ea3b8";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "none");
    var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    var grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.setAttribute("id", "spark-" + id);
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "1");
    var stopA = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stopA.setAttribute("offset", "0%");
    stopA.setAttribute("stop-color", color);
    stopA.setAttribute("stop-opacity", "0.42");
    var stopB = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stopB.setAttribute("offset", "100%");
    stopB.setAttribute("stop-color", color);
    stopB.setAttribute("stop-opacity", "0");
    grad.appendChild(stopA);
    grad.appendChild(stopB);
    defs.appendChild(grad);
    var area = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    area.setAttribute("points", "0," + height + " " + line + " " + width + "," + height);
    area.setAttribute("fill", "url(#spark-" + id + ")");
    var stroke = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    stroke.setAttribute("points", line);
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke", color);
    stroke.setAttribute("stroke-width", "5");
    stroke.setAttribute("stroke-linejoin", "round");
    stroke.setAttribute("stroke-linecap", "round");
    stroke.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(defs);
    svg.appendChild(area);
    svg.appendChild(stroke);
    return svg;
  }

  function paintClocks(now) {
    for (var i = 0; i < clockNodes.length; i++) {
      var node = clockNodes[i];
      var timeEl = node.querySelector(".time");
      var badgeEl = node.querySelector(".badge");
      try {
        timeEl.textContent = MarketHours.formatClock(now, node.dataset.tz);
        var state = MarketHours.badge(node.dataset.market, now);
        badgeEl.textContent = state.text;
        badgeEl.classList.toggle("open", state.open);
        badgeEl.classList.toggle("closed", !state.open);
        node.classList.toggle("open", state.open);
        node.classList.toggle("closed", !state.open);
        var etaEl = node.querySelector(".nyse-eta");
        if (etaEl && node.dataset.countdown === "nyse") etaEl.textContent = MarketHours.nyseCountdown(now);
      } catch (err) {
        timeEl.textContent = "--:--";
      }
    }
    var keys = ["bayn", "bayry", "wmt", "nvda"];
    for (var c = 0; c < keys.length; c++) {
      var card = cards[keys[c]];
      var quote = data && data.quotes ? data.quotes[keys[c]] : null;
      var closeEl = card.querySelector(".at-close");
      var session = quote && quote.session ? quote.session : keys[c] === "bayn" ? "xetra" : "us";
      var open = false;
      try {
        open = MarketHours.isOpen(session, now);
      } catch (err) {
        open = false;
      }
      closeEl.hidden = open || !quote;
    }
  }

  function paintQuote(id, quote) {
    var card = cards[id];
    var priceEl = card.querySelector(".q-price");
    var changeEl = card.querySelector(".q-chg");
    var sparkEl = card.querySelector(".spark");
    if (!quote || !isFinite(Number(quote.price))) {
      priceEl.textContent = "—";
      priceEl.className = "q-price";
      changeEl.textContent = "—";
      sparkEl.replaceChildren();
      return;
    }
    var digits = quote.digits || 2;
    var dir = direction(Number(quote.change));
    priceEl.textContent = money(quote.price, quote.currency, digits);
    priceEl.className = "q-price " + dir;
    changeEl.className = "q-chg " + dir;
    changeEl.replaceChildren();
    var text = document.createElement("span");
    text.textContent = signed(quote.change, digits) + " (" + percent(quote.changePct) + ")";
    changeEl.appendChild(text);
    var mark = arrow(dir);
    if (mark) changeEl.appendChild(mark);
    var chart = sparkline(quote.sparkline || [], dir, id);
    sparkEl.replaceChildren();
    if (chart) sparkEl.appendChild(chart);
  }

  function paintTicker() {
    tickerEl.replaceChildren();
    if (!data || !data.ticker) return;
    var order = ["sp500", "dow", "dax", "eurusd"];
    var shown = 0;
    for (var i = 0; i < order.length; i++) {
      var item = data.ticker[order[i]];
      if (!item || !isFinite(Number(item.price))) continue;
      if (shown) {
        var sep = document.createElement("span");
        sep.className = "t-sep";
        sep.textContent = "·";
        tickerEl.appendChild(sep);
      }
      var dir = direction(Number(item.change));
      var name = document.createElement("span");
      name.className = "t-name";
      name.textContent = item.name;
      var px = document.createElement("span");
      px.className = "t-px";
      var digits = item.digits != null ? item.digits : order[i] === "eurusd" ? 4 : 2;
      px.textContent = Number(item.price).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      var pct = document.createElement("span");
      pct.className = "t-pct " + dir;
      pct.textContent = percent(item.changePct);
      tickerEl.appendChild(name);
      tickerEl.appendChild(px);
      tickerEl.appendChild(pct);
      shown += 1;
    }
  }

  function headlineWhen(iso, now) {
    var date = new Date(iso);
    if (!isFinite(date.getTime())) return "";
    var local = MarketHours.parts(date, "America/New_York");
    var today = MarketHours.parts(now, "America/New_York");
    var clock = MarketHours.formatClock(date, "America/New_York") + " ET";
    if (local.key === today.key) return clock;
    return MONTHS[local.month - 1] + " " + local.day + ", " + clock;
  }

  function readPreview() {
    try {
      var value = new URLSearchParams(location.search).get("preview");
      if (value === "before" || value === "after" || value === "results" || value === "reaction" || value === "consumer" || value === "mirafiber" || value === "rotation") {
        return value;
      }
    } catch (err) {
      return "";
    }
    return "";
  }

  function currentEvent(realNow) {
    var preview = readPreview();
    var list = eventsConfig.events || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var now = Events.previewNow(item, preview, realNow);
      var state = Events.phase(item, now);
      if (state === "hidden") continue;
      return {
        event: item,
        now: now,
        phase: state,
        highlight: Events.highlightOn(item, now),
      };
    }
    return null;
  }

  function figuresFor(id) {
    var block = data && data.releaseFigures && data.releaseFigures[id];
    if (!block || !block.items || block.items.length < 2) return null;
    var clean = [];
    for (var i = 0; i < block.items.length && clean.length < 3; i++) {
      var item = block.items[i];
      if (!item || !item.label || !/^[€$][0-9]/.test(String(item.value || ""))) continue;
      clean.push({ label: String(item.label), value: String(item.value) });
    }
    return clean.length >= 2 ? { items: clean } : null;
  }

  function countUnit(id, unitId, caption) {
    var cell = document.createElement("div");
    cell.className = "count-unit";
    cell.id = unitId;
    var value = document.createElement("b");
    value.id = id;
    value.textContent = "00";
    var label = document.createElement("span");
    label.textContent = caption;
    cell.appendChild(value);
    cell.appendChild(label);
    return cell;
  }

  function buildEvent(model) {
    var item = model.event;
    eventEl.classList.add("is-on");
    eventEl.classList.toggle("is-after", model.phase === "after");
    eventEl.replaceChildren();

    var mark = document.createElement("img");
    mark.className = "event-mark";
    mark.src = "assets/bayer-cross.svg";
    mark.alt = "";

    var copy = document.createElement("div");
    copy.className = "event-copy";
    var heading = document.createElement("div");
    heading.className = "event-title";
    var released = model.phase === "after" && item.released && item.released.label;
    heading.textContent = released ? item.title : model.phase === "after" ? item.outTitle : item.title;
    var sub = document.createElement("div");
    sub.className = "event-sub";
    sub.textContent = Events.dateLabel(item.releaseAt, item.timezone || "Europe/Berlin") + "  ·  " + (item.sourceLabel || "");
    var lines = document.createElement("div");
    lines.className = "event-lines";
    var moments = item.moments || [];
    for (var i = 0; i < moments.length; i++) {
      var row = document.createElement("div");
      row.className = "event-line";
      var kicker = document.createElement("span");
      kicker.className = "event-kicker";
      kicker.textContent = moments[i].label;
      var when = document.createElement("span");
      when.textContent = Events.formatZoneLine(Events.zoneTimes(moments[i].at, item.clocks));
      row.appendChild(kicker);
      row.appendChild(when);
      if (moments[i].detail) {
        var detail = document.createElement("span");
        detail.className = "event-detail";
        detail.textContent = "·  " + moments[i].detail;
        row.appendChild(detail);
      }
      lines.appendChild(row);
    }
    var figures = figuresFor(item.id);
    if (figures) {
      var figRow = document.createElement("div");
      figRow.className = "event-figures";
      for (var f = 0; f < figures.items.length; f++) {
        var cell = document.createElement("span");
        var figLabel = document.createElement("span");
        figLabel.className = "fig-label";
        figLabel.textContent = figures.items[f].label;
        var figValue = document.createElement("span");
        figValue.className = "fig-value";
        figValue.textContent = figures.items[f].value;
        cell.appendChild(figLabel);
        cell.appendChild(figValue);
        figRow.appendChild(cell);
      }
      lines.appendChild(figRow);
    }
    if (released && item.released.note) {
      lines.appendChild(document.createElement("div")).className = "event-note";
      lines.lastChild.textContent = item.released.note;
    }
    if (released && item.released.url) {
      var link = document.createElement("a");
      link.className = "event-link";
      link.href = item.released.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Quarterly reports";
      lines.appendChild(link);
    }
    copy.appendChild(heading);
    copy.appendChild(sub);
    copy.appendChild(lines);

    var count = document.createElement("div");
    count.className = "event-count";
    count.id = "event-count";
    var countLabel = document.createElement("div");
    countLabel.className = "count-label";
    countLabel.id = "cd-label";
    var units = document.createElement("div");
    units.className = "count-units";
    units.id = "count-units";
    units.appendChild(countUnit("cd-d", "cd-days", "days"));
    units.appendChild(countUnit("cd-h", "cd-hours", "hrs"));
    units.appendChild(countUnit("cd-m", "cd-mins", "min"));
    units.appendChild(countUnit("cd-s", "cd-secs", "sec"));
    count.appendChild(countLabel);
    count.appendChild(units);

    eventEl.appendChild(mark);
    eventEl.appendChild(copy);
    eventEl.appendChild(count);
  }

  function updateCountdown(model) {
    var labelEl = document.getElementById("cd-label");
    var units = document.getElementById("count-units");
    if (!labelEl || !units) return;
    if (model.phase === "after" && model.event.released && model.event.released.label) {
      labelEl.textContent = model.event.released.label;
      units.hidden = true;
      return;
    }
    var target = null;
    var label = "Release in";
    if (model.phase === "before") {
      target = Date.parse(model.event.releaseAt);
    } else {
      var next = Events.nextMoment(model.event, model.now);
      if (next) {
        target = next.at;
        label = next.moment.label + " in";
      }
    }
    if (!target || !isFinite(target)) {
      labelEl.textContent = "Published";
      units.hidden = true;
      return;
    }
    units.hidden = false;
    var left = Events.countdown(target, model.now.getTime());
    labelEl.textContent = label;
    document.getElementById("cd-d").textContent = String(left.days);
    document.getElementById("cd-h").textContent = Events.pad(left.hours);
    document.getElementById("cd-m").textContent = Events.pad(left.mins);
    document.getElementById("cd-s").textContent = Events.pad(left.secs);
    document.getElementById("cd-days").hidden = left.days === 0;
  }

  function paintEvent(realNow) {
    var model = null;
    try {
      model = currentEvent(realNow || new Date());
    } catch (err) {
      model = null;
    }
    eventModel = model;
    stage.classList.toggle("has-event", !!model);
    var symbols = model && model.highlight && model.event.highlightSymbols ? model.event.highlightSymbols : [];
    Object.keys(cards).forEach(function (id) {
      cards[id].classList.toggle("event-focus", symbols.indexOf(id) >= 0);
    });
    if (!model) {
      eventEl.classList.remove("is-on");
      eventSignature = "";
      return;
    }
    var signature = model.phase + "|" + model.event.id + "|" + (model.highlight ? "1" : "0");
    var moments = model.event.moments || [];
    for (var i = 0; i < moments.length; i++) {
      signature += "|" + Events.formatZoneLine(Events.zoneTimes(moments[i].at, model.event.clocks));
    }
    var figures = figuresFor(model.event.id);
    signature += figures ? "|" + figures.items.length : "|0";
    if (signature !== eventSignature) {
      eventSignature = signature;
      buildEvent(model);
    }
    updateCountdown(model);
  }

  function bayerItems(items) {
    if (!eventModel || eventModel.phase !== "after" || tab !== "bayer") return items;
    var releases = (data && data.releases) || [];
    var pinned = [];
    for (var i = 0; i < releases.length; i++) {
      if (releases[i].eventId === eventModel.event.id) pinned.push(releases[i]);
    }
    if (!pinned.length) return items;
    var seen = {};
    var merged = [];
    var all = pinned.concat(items);
    for (var n = 0; n < all.length; n++) {
      var key = String(all[n].title || "").toLowerCase();
      if (!key || seen[key]) continue;
      seen[key] = true;
      merged.push(all[n]);
    }
    return merged;
  }

  function paintHeadlines(now) {
    title.textContent = "HEADLINES · " + (TAB_NAME[tab] || "BAYER");
    for (var b = 0; b < tabButtons.length; b++) {
      var active = tabButtons[b].dataset.tab === tab;
      tabButtons[b].classList.toggle("active", active);
      tabButtons[b].setAttribute("aria-selected", active ? "true" : "false");
    }
    var items = data && data.headlines && data.headlines[tab] ? data.headlines[tab].slice() : [];
    items = bayerItems(items);
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "hl-empty";
      empty.textContent = "Headlines will appear when the feed updates.";
      list.appendChild(empty);
      return;
    }
    var count = Math.min(3, items.length);
    for (var i = 0; i < count; i++) {
      var item = items[i];
      var li = document.createElement("li");
      var bullet = document.createElement("span");
      bullet.className = "bullet";
      var text = document.createElement("span");
      text.className = "hl-title";
      text.textContent = item.title || "";
      var meta = document.createElement("span");
      meta.className = "hl-meta";
      if (item.release) li.classList.add("is-release");
      var bits = [];
      if (item.release) bits.push("RELEASE");
      if (item.source) bits.push(String(item.source).toUpperCase());
      var when = item.publishedAt ? headlineWhen(item.publishedAt, now) : "";
      if (when) bits.push(when);
      meta.replaceChildren();
      for (var m = 0; m < bits.length; m++) {
        if (m) meta.appendChild(document.createTextNode(" · "));
        if (item.release && bits[m] === "RELEASE") {
          var tag = document.createElement("span");
          tag.className = "release-tag";
          tag.textContent = "RELEASE";
          meta.appendChild(tag);
        } else {
          meta.appendChild(document.createTextNode(bits[m]));
        }
      }
      li.appendChild(bullet);
      li.appendChild(text);
      li.appendChild(meta);
      list.appendChild(li);
    }
  }

  function paintStatus(stale) {
    var note = data && data.delayNote ? data.delayNote : "Quotes delayed 15 min";
    var updated = "";
    if (data && data.updatedAt && isFinite(Date.parse(data.updatedAt))) {
      updated = " · Updated " + MarketHours.formatClock(new Date(data.updatedAt), "America/New_York") + " ET";
    } else if (!data) {
      updated = " · Waiting for data";
      stale = true;
    }
    statusEl.textContent = note + updated + (stale ? " · Stale" : "");
    statusEl.classList.toggle("stale", !!stale);
  }

  function render(stale) {
    var now = new Date();
    paintClocks(now);
    paintQuote("bayn", data && data.quotes && data.quotes.bayn);
    paintQuote("bayry", data && data.quotes && data.quotes.bayry);
    paintQuote("wmt", data && data.quotes && data.quotes.wmt);
    paintQuote("nvda", data && data.quotes && data.quotes.nvda);
    paintTicker();
    paintEvent(now);
    paintHeadlines(now);
    paintStatus(stale);
  }

  function showTab(next, animate) {
    if (TABS.indexOf(next) < 0) return;
    var token = ++fadeToken;
    var apply = function () {
      if (token !== fadeToken) return;
      tab = next;
      try {
        paintHeadlines(new Date());
      } catch (err) {
        /* Keep the previous list rather than clearing the panel. */
      }
      list.classList.remove("fade");
    };
    if (animate) {
      list.classList.add("fade");
      setTimeout(apply, 220);
    } else {
      apply();
    }
  }

  function armRotation() {
    clearInterval(rotateTimer);
    rotateTimer = setInterval(function () {
      var index = TABS.indexOf(tab);
      showTab(TABS[(index + 1) % TABS.length], true);
    }, ROTATE_MS);
  }

  function applyPayload(payload, failed) {
    if (payload && payload.quotes) data = payload;
    fetchFailed = !!failed;
    var stale = fetchFailed || !!(data && (MarketHours.isDataStale(data.updatedAt, new Date()) || data.degraded));
    try {
      render(stale);
    } catch (err) {
      paintStatus(true);
    }
  }

  function closeOn(rows, date) {
    if (!rows || !date) return null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date === date && isFinite(Number(rows[i].close))) return Number(rows[i].close);
    }
    return null;
  }

  function moveFrom(price, reference) {
    var px = Number(price);
    var ref = Number(reference);
    if (!isFinite(px) || !isFinite(ref) || ref === 0) return null;
    var abs = px - ref;
    return { pct: abs / ref * 100, abs: abs };
  }

  function pctText(move) {
    if (!move) return "—";
    var body = Math.abs(move.pct).toFixed(1) + "%";
    if (move.pct > 0) return "+" + body;
    if (move.pct < 0) return "−" + body;
    return body;
  }

  function reactionView(event) {
    var refDate = event && event.referenceDate;
    var closes = (data && data.dailyCloses) || {};
    var bayn = data && data.quotes && data.quotes.bayn;
    var bayry = data && data.quotes && data.quotes.bayry;
    var dax = data && data.ticker && data.ticker.dax;
    var baynMove = bayn ? moveFrom(bayn.price, closeOn(closes.bayn, refDate)) : null;
    var daxMove = dax ? moveFrom(dax.price, closeOn(closes.dax, refDate)) : null;
    var adrMove = bayry ? moveFrom(bayry.price, closeOn(closes.bayry, refDate)) : null;
    var versus = "";
    if (baynMove && daxMove) {
      var gap = baynMove.pct - daxMove.pct;
      versus = gap > 0.05 ? "Bayer outperforming" : gap < -0.05 ? "Bayer underperforming" : "Bayer in line with DAX";
    }
    var sessionToday = false;
    if (bayn && bayn.sessionDate) {
      try {
        sessionToday = MarketHours.parts(new Date(), "Europe/Berlin").key === bayn.sessionDate;
      } catch (err) {
        sessionToday = false;
      }
    }
    var mediaTime = "—";
    if (event && event.moments) {
      for (var i = 0; i < event.moments.length; i++) {
        if (event.moments[i].id === "media") {
          var times = Events.zoneTimes(event.moments[i].at, [{ timeZone: "America/Chicago", label: "CT" }]);
          if (times[0]) mediaTime = times[0].text + " CT";
        }
      }
    }
    var refLabel = "release";
    if (refDate && /^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      refLabel = months[Number(refDate.slice(5, 7)) - 1] + " " + Number(refDate.slice(8)) + " close";
    }
    var status = baynMove ? "" : "Nov 2 Xetra close is not in the feed yet";
    return {
      baynSince: pctText(baynMove),
      daxSince: pctText(daxMove),
      adrSince: pctText(adrMove),
      euroChange: baynMove ? (baynMove.abs >= 0 ? "+" : "−") + "€" + Math.abs(baynMove.abs).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      price: bayn ? (bayn.currency === "EUR" ? "€" : "") + Number(bayn.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—",
      versus: versus,
      sparkline: bayn && bayn.sparkline ? bayn.sparkline : [],
      chartCaption: sessionToday ? "Intraday since open" : "Last Xetra session",
      chartNote: bayn && bayn.sessionDate ? (sessionToday ? "Release 7:30 CET" : "Session " + bayn.sessionDate) : "",
      mediaTime: mediaTime,
      refLabel: refLabel,
      status: status,
    };
  }

  function primaryEvent() {
    var list = (eventsConfig && eventsConfig.events) || [];
    return list.length ? list[0] : null;
  }

  function screenList() {
    var preview = readPreview();
    var model = null;
    try {
      model = currentEvent(new Date());
    } catch (err) {
      model = null;
    }
    var event = model ? model.event : primaryEvent();
    var inWindow = !!(model && model.phase !== "hidden");
    return Events.rotationScreens(event, Events.earningsFilled(earningsDoc), preview, inWindow);
  }

  function showScreen(name) {
    var screens = screenList();
    if (screens.indexOf(name) < 0) name = screens[0] || "board";
    stage.classList.toggle("show-results", name === "results");
    stage.classList.toggle("show-reaction", name === "reaction");
    stage.classList.toggle("show-consumer", name === "consumer");
    stage.classList.toggle("show-mirafiber", name === "mirafiber");
    var event = primaryEvent();
    var reaction = reactionView(event);
    if (name === "results") {
      var preview = readPreview();
      var q3Sales = earningsDoc && earningsDoc.group && String(earningsDoc.group.sales || "").trim();
      var doc = preview === "results" || preview === "rotation"
        ? (q3Sales && earningsDoc.badge ? earningsDoc : MarketScreens.sampleQ2)
        : earningsDoc;
      if (!Events.earningsFilled(doc) && preview !== "results" && preview !== "rotation") {
        stage.classList.remove("show-results");
        return;
      }
      MarketScreens.renderResults(resultsEl, doc, reaction);
    }
    if (name === "reaction") {
      reaction.preview = readPreview() === "reaction" || readPreview() === "rotation";
      MarketScreens.renderReaction(reactionEl, reaction);
    }
    if (name === "consumer") {
      MarketScreens.renderConsumer(consumerEl);
    }
    if (name === "mirafiber") {
      MarketScreens.renderMirafiber(document.getElementById("mirafiber-screen"), window.MiraFiberOffer || null);
    }
  }

  function armScreens() {
    clearInterval(screenTimer);
    var screens = screenList();
    if (screenIndex >= screens.length) screenIndex = 0;
    showScreen(screens[screenIndex] || "board");
    if (screens.length < 2) return;
    var ms = primaryEvent() && primaryEvent().rotateMs ? Number(primaryEvent().rotateMs) : 20000;
    if (!isFinite(ms) || ms < 5000) ms = 20000;
    screenTimer = setInterval(function () {
      var list = screenList();
      if (list.length < 2) {
        showScreen("board");
        clearInterval(screenTimer);
        return;
      }
      screenIndex = (screenIndex + 1) % list.length;
      showScreen(list[screenIndex]);
    }, ms);
  }

  function loadEarnings() {
    var event = primaryEvent();
    var file = event && event.resultsFile ? event.resultsFile : "data/earnings_q3_2026.json";
    return fetch(file + "?ts=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (doc) {
        earningsDoc = doc;
      })
      .catch(function () {
        earningsDoc = earningsDoc || null;
      });
  }

  function loadMirafiber() {
    return fetch("data/mirafiber.json?ts=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (doc) {
        window.MiraFiberOffer = doc;
      })
      .catch(function () {
        window.MiraFiberOffer = window.MiraFiberOffer || null;
      });
  }

  function loadEvents() {
    return fetch("data/events.json?ts=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (cfg) {
        eventsConfig = cfg && cfg.events ? cfg : { events: [] };
        paintEvent(new Date());
        return loadEarnings().then(loadMirafiber);
      })
      .then(function () {
        armScreens();
      })
      .catch(function () {
        paintEvent(new Date());
        armScreens();
      });
  }

  function refresh() {
    var url = "data/market.json?ts=" + Math.floor(Date.now() / 60000);
    return fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.quotes || !payload.quotes.bayn) throw new Error("shape");
        writeStore(payload);
        applyPayload(payload, false);
        return loadEvents();
      })
      .catch(function () {
        var cached = data || readStore();
        applyPayload(cached, true);
      });
  }

  function tick() {
    var now = new Date();
    try {
      paintClocks(now);
      paintEvent(now);
      if (MarketHours.shouldNightlyReload(now, localStorage.getItem(RELOAD_KEY) || "")) {
        localStorage.setItem(RELOAD_KEY, MarketHours.parts(now, "America/New_York").key);
        location.reload();
        return;
      }
    } catch (err) {
      /* A clock failure must not stop quote rendering. */
    }
    var wait = 1000 - (Date.now() % 1000) + 30;
    setTimeout(tick, wait);
  }

  for (var i = 0; i < tabButtons.length; i++) {
    tabButtons[i].addEventListener("click", function (event) {
      showTab(event.currentTarget.dataset.tab, true);
      armRotation();
    });
  }

  window.addEventListener("resize", fit);
  fit();
  stage.classList.add("ready");
  applyPayload(readStore(), false);
  loadEvents();
  refresh();
  armRotation();
  tick();
  refreshTimer = setInterval(refresh, REFRESH_MS);
  window.addEventListener("online", refresh);

  window.MarketWatch = {
    refresh: refresh,
    showTab: showTab,
    fit: fit,
  };
})();
