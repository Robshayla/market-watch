/* Config-driven office-event banner. Schedule math only; no copy is invented here. */
(function (root) {
  "use strict";

  var WEEKDAYS = {
    Sun: "Sunday",
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function hoursApi() {
    return root.MarketHours;
  }

  function parseTime(iso) {
    var t = Date.parse(iso);
    return isFinite(t) ? t : NaN;
  }

  function previewNow(event, preview, realNow) {
    var release = parseTime(event.releaseAt);
    var hide = parseTime(event.hideAfter);
    if (preview === "before") {
      if (isFinite(release) && realNow.getTime() < release) return realNow;
      return new Date(release - 26 * 60 * 60 * 1000);
    }
    if (preview === "after") {
      if (isFinite(release) && isFinite(hide) && realNow.getTime() >= release && realNow.getTime() < hide) {
        return realNow;
      }
      return new Date(release + 15 * 60 * 1000);
    }
    return realNow;
  }

  function phase(event, now) {
    var release = parseTime(event.releaseAt);
    var hide = parseTime(event.hideAfter);
    if (!isFinite(release) || !now) return "hidden";
    if (isFinite(hide) && now.getTime() >= hide) return "hidden";
    if (now.getTime() < release) return "before";
    return "after";
  }

  function highlightOn(event, now) {
    if (!event || !now || phase(event, now) !== "after") return false;
    var api = hoursApi();
    if (!api) return false;
    var zone = event.timezone || "Europe/Berlin";
    var release = new Date(parseTime(event.releaseAt));
    return api.parts(release, zone).key === api.parts(now, zone).key;
  }

  function dateLabel(iso, timeZone) {
    var api = hoursApi();
    var parts = api.parts(new Date(iso), timeZone);
    return WEEKDAYS[parts.weekday] + ", " + MONTHS[parts.month - 1] + " " + parts.day;
  }

  function zoneTimes(iso, clocks) {
    var api = hoursApi();
    var date = new Date(iso);
    var seen = Object.create(null);
    var out = [];
    var list = clocks || [];
    for (var i = 0; i < list.length; i++) {
      var text = api.formatClock(date, list[i].timeZone);
      if (seen[text]) continue;
      seen[text] = true;
      out.push({ label: list[i].label, text: text });
    }
    return out;
  }

  function formatZoneLine(times) {
    var bits = [];
    for (var i = 0; i < times.length; i++) bits.push(times[i].text + " " + times[i].label);
    return bits.join("  ·  ");
  }

  function countdown(targetMs, nowMs) {
    var diff = targetMs - nowMs;
    if (!isFinite(diff) || diff <= 0) {
      return { days: 0, hours: 0, mins: 0, secs: 0, done: true };
    }
    var total = Math.floor(diff / 1000);
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      mins: Math.floor((total % 3600) / 60),
      secs: total % 60,
      done: false,
    };
  }

  function nextMoment(event, now) {
    var moments = event.moments || [];
    var best = null;
    for (var i = 0; i < moments.length; i++) {
      var at = parseTime(moments[i].at);
      if (!isFinite(at) || at <= now.getTime()) continue;
      if (!best || at < best.at) best = { moment: moments[i], at: at };
    }
    return best;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function earningsFilled(doc) {
    if (!doc || doc.ready !== true || !doc.group) return false;
    var groupKeys = ["sales", "salesCpa", "ebitda", "ebitdaChange", "margin"];
    var g = doc.group;
    for (var i = 0; i < groupKeys.length; i++) {
      if (!text(g[groupKeys[i]])) return false;
    }
    if (!doc.divisions || doc.divisions.length < 3) return false;
    for (var d = 0; d < 3; d++) {
      var div = doc.divisions[d];
      if (!div || !text(div.name) || !text(div.sales) || !text(div.salesCpa) || !text(div.ebitda) || !text(div.ebitdaChange)) {
        return false;
      }
    }
    return true;
  }

  function rotationScreens(event, filled, preview, inWindow) {
    if (preview === "results") return ["results"];
    if (preview === "reaction") return ["reaction"];
    if (preview === "consumer") return ["consumer"];
    if (preview === "rotation") return ["board", "results", "consumer", "reaction"];
    var screens = [];
    if (inWindow && event) {
      if (event.showResults === true && filled) screens.push("results");
      screens.push("board");
      if (event.showReaction === true) screens.push("reaction");
    } else {
      screens.push("board");
    }
    screens.push("consumer");
    return screens;
  }

  root.Events = {
    previewNow: previewNow,
    phase: phase,
    highlightOn: highlightOn,
    dateLabel: dateLabel,
    zoneTimes: zoneTimes,
    formatZoneLine: formatZoneLine,
    countdown: countdown,
    nextMoment: nextMoment,
    pad: pad,
    earningsFilled: earningsFilled,
    rotationScreens: rotationScreens,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
