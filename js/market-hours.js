/* Market session clocks for the lobby display.
   NYSE holidays and early closes follow the NYSE Group calendars published for
   2026–2028 (ICE, December 2025) and the same observance rules after that.
   Xetra closures follow the Deutsche Börse FWB calendars: New Year's Day,
   Good Friday, Easter Monday, Labour Day, Christmas Eve, Christmas Day,
   Boxing Day, and New Year's Eve, with no weekend observance shift.
   LSE uses 08:00–16:30 London time on weekdays. SSE uses 09:30–11:30 and
   13:00–15:00 Beijing time on weekdays; the lunch break is closed. LSE and
   SSE do not include holiday calendars.
   Session times are interpreted in the exchange's IANA zone, so DST is
   handled by the runtime timezone database. */
(function (root) {
  "use strict";

  var NYSE_OPEN = 9 * 60 + 30;
  var NYSE_CLOSE = 16 * 60;
  var NYSE_EARLY_CLOSE = 13 * 60;
  var XETRA_OPEN = 9 * 60;
  var XETRA_CLOSE = 17 * 60 + 30;
  var LSE_OPEN = 8 * 60;
  var LSE_CLOSE = 16 * 60 + 30;
  var SSE_AM_OPEN = 9 * 60 + 30;
  var SSE_AM_CLOSE = 11 * 60 + 30;
  var SSE_PM_OPEN = 13 * 60;
  var SSE_PM_CLOSE = 15 * 60;

  var partsFmt = Object.create(null);
  var clockFmt = Object.create(null);
  var closureCache = Object.create(null);

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function ymd(year, month, day) {
    return year + "-" + pad(month) + "-" + pad(day);
  }

  function utcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  function addDays(year, month, day, delta) {
    var dt = utcDate(year, month, day);
    dt.setUTCDate(dt.getUTCDate() + delta);
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    };
  }

  function weekdayUTC(year, month, day) {
    return utcDate(year, month, day).getUTCDay();
  }

  function nthWeekday(year, month, weekday, n) {
    var first = weekdayUTC(year, month, 1);
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }

  function lastWeekday(year, month, weekday) {
    var last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var wd = weekdayUTC(year, month, last);
    return last - ((wd - weekday + 7) % 7);
  }

  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return { year: year, month: month, day: day };
  }

  function observeUS(year, month, day) {
    var wd = weekdayUTC(year, month, day);
    if (wd === 6) return addDays(year, month, day, -1);
    if (wd === 0) return addDays(year, month, day, 1);
    return { year: year, month: month, day: day };
  }

  function nyseClosures(year) {
    var set = Object.create(null);
    var nyWd = weekdayUTC(year, 1, 1);
    if (nyWd === 0) {
      var shifted = addDays(year, 1, 1, 1);
      set[ymd(shifted.year, shifted.month, shifted.day)] = true;
    } else if (nyWd !== 6) {
      /* Saturday New Year's is not observed on the prior Friday (NYSE 2028). */
      set[ymd(year, 1, 1)] = true;
    }
    set[ymd(year, 1, nthWeekday(year, 1, 1, 3))] = true;
    set[ymd(year, 2, nthWeekday(year, 2, 1, 3))] = true;
    var easter = easterSunday(year);
    var goodFriday = addDays(easter.year, easter.month, easter.day, -2);
    set[ymd(goodFriday.year, goodFriday.month, goodFriday.day)] = true;
    set[ymd(year, 5, lastWeekday(year, 5, 1))] = true;
    var june = observeUS(year, 6, 19);
    set[ymd(june.year, june.month, june.day)] = true;
    var july = observeUS(year, 7, 4);
    set[ymd(july.year, july.month, july.day)] = true;
    set[ymd(year, 9, nthWeekday(year, 9, 1, 1))] = true;
    set[ymd(year, 11, nthWeekday(year, 11, 4, 4))] = true;
    var christmas = observeUS(year, 12, 25);
    set[ymd(christmas.year, christmas.month, christmas.day)] = true;
    return set;
  }

  function nyseEarlyCloses(year) {
    var set = Object.create(null);
    var closures = nyseClosures(year);
    var thanksgiving = nthWeekday(year, 11, 4, 4);
    var after = addDays(year, 11, thanksgiving, 1);
    var afterKey = ymd(after.year, after.month, after.day);
    if (!closures[afterKey]) set[afterKey] = true;
    var dec24 = ymd(year, 12, 24);
    var decWd = weekdayUTC(year, 12, 24);
    if (decWd !== 0 && decWd !== 6 && !closures[dec24]) set[dec24] = true;
    /* Published exception: early close on the Monday when July 4 is a Tuesday. */
    if (weekdayUTC(year, 7, 4) === 2) {
      var july3 = ymd(year, 7, 3);
      if (!closures[july3]) set[july3] = true;
    }
    return set;
  }

  function xetraClosures(year) {
    var set = Object.create(null);
    var easter = easterSunday(year);
    var goodFriday = addDays(easter.year, easter.month, easter.day, -2);
    var easterMonday = addDays(easter.year, easter.month, easter.day, 1);
    var dates = [
      { year: year, month: 1, day: 1 },
      goodFriday,
      easterMonday,
      { year: year, month: 5, day: 1 },
      { year: year, month: 12, day: 24 },
      { year: year, month: 12, day: 25 },
      { year: year, month: 12, day: 26 },
      { year: year, month: 12, day: 31 },
    ];
    for (var i = 0; i < dates.length; i++) {
      set[ymd(dates[i].year, dates[i].month, dates[i].day)] = true;
    }
    return set;
  }

  function closuresFor(market, year) {
    var key = market + ":" + year;
    if (!closureCache[key]) {
      if (market === "xetra") {
        closureCache[key] = { closed: xetraClosures(year), early: Object.create(null) };
      } else if (market === "nyse") {
        closureCache[key] = { closed: nyseClosures(year), early: nyseEarlyCloses(year) };
      } else {
        /* LSE and SSE use weekday session hours only; holiday calendars are not included. */
        closureCache[key] = { closed: Object.create(null), early: Object.create(null) };
      }
    }
    return closureCache[key];
  }

  function parts(date, timeZone) {
    if (!partsFmt[timeZone]) {
      partsFmt[timeZone] = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    }
    var bag = {};
    var list = partsFmt[timeZone].formatToParts(date);
    for (var i = 0; i < list.length; i++) {
      if (list[i].type !== "literal") bag[list[i].type] = list[i].value;
    }
    var hour = Number(bag.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour: hour,
      minute: Number(bag.minute),
      second: Number(bag.second),
      weekday: bag.weekday,
      key: bag.year + "-" + bag.month + "-" + bag.day,
    };
  }

  function formatClock(date, timeZone) {
    if (!clockFmt[timeZone]) {
      clockFmt[timeZone] = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return clockFmt[timeZone]
      .format(date)
      .replace(/[\u202f\u00a0]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeMarket(market) {
    if (market === "us" || market === "nyse" || market === "nasdaq" || market === "otc") {
      return "nyse";
    }
    if (market === "xetra" || market === "frankfurt") return "xetra";
    if (market === "lse" || market === "london") return "lse";
    if (market === "sse" || market === "shanghai") return "sse";
    return null;
  }

  function zoneFor(canon) {
    if (canon === "xetra") return "Europe/Berlin";
    if (canon === "lse") return "Europe/London";
    if (canon === "sse") return "Asia/Shanghai";
    return "America/New_York";
  }

  function isOpen(market, date) {
    var canon = normalizeMarket(market);
    if (!canon) return false;
    var p = parts(date, zoneFor(canon));
    if (p.weekday === "Sat" || p.weekday === "Sun") return false;
    var book = closuresFor(canon, p.year);
    if (book.closed[p.key]) return false;
    var minute = p.hour * 60 + p.minute;
    var open;
    if (canon === "xetra") open = minute >= XETRA_OPEN && minute < XETRA_CLOSE;
    else if (canon === "lse") open = minute >= LSE_OPEN && minute < LSE_CLOSE;
    else if (canon === "sse") {
      open = (minute >= SSE_AM_OPEN && minute < SSE_AM_CLOSE) ||
        (minute >= SSE_PM_OPEN && minute < SSE_PM_CLOSE);
    } else {
      var close = book.early[p.key] ? NYSE_EARLY_CLOSE : NYSE_CLOSE;
      open = minute >= NYSE_OPEN && minute < close;
    }
    return open;
  }

  function badgeName(canon) {
    if (canon === "xetra") return "XETRA";
    if (canon === "lse") return "LSE";
    if (canon === "sse") return "SSE";
    return "NYSE";
  }

  function badge(market, date) {
    var canon = normalizeMarket(market);
    var open = isOpen(canon, date);
    var name = badgeName(canon);
    return { open: open, text: name + (open ? " OPEN" : " CLOSED") };
  }

  function zonedDate(year, month, day, hour, minute, timeZone) {
    var wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    var date = new Date(wanted);
    for (var i = 0; i < 2; i++) {
      var p = parts(date, timeZone);
      var got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      date = new Date(date.getTime() + (wanted - got));
    }
    return date;
  }

  function isNyseTradingDay(year, month, day) {
    var wd = weekdayUTC(year, month, day);
    if (wd === 0 || wd === 6) return false;
    var book = closuresFor("nyse", year);
    return !book.closed[ymd(year, month, day)];
  }

  function nyseOpenAt(year, month, day) {
    return zonedDate(year, month, day, 9, 30, "America/New_York");
  }

  function nyseCloseAt(year, month, day) {
    var book = closuresFor("nyse", year);
    var close = book.early[ymd(year, month, day)] ? NYSE_EARLY_CLOSE : NYSE_CLOSE;
    return zonedDate(year, month, day, Math.floor(close / 60), close % 60, "America/New_York");
  }

  function nextNyseTradingDay(year, month, day, startOffset) {
    for (var i = startOffset; i <= startOffset + 10; i++) {
      var d = addDays(year, month, day, i);
      if (isNyseTradingDay(d.year, d.month, d.day)) return d;
    }
    return null;
  }

  function formatEta(ms) {
    var totalMins = Math.max(0, Math.floor(ms / 60000));
    var hours = Math.floor(totalMins / 60);
    var mins = totalMins % 60;
    if (hours <= 0) return mins + "m";
    return hours + "h " + pad(mins) + "m";
  }

  function nyseCountdown(date) {
    var p = parts(date, "America/New_York");
    if (isNyseTradingDay(p.year, p.month, p.day)) {
      var openAt = nyseOpenAt(p.year, p.month, p.day);
      var closeAt = nyseCloseAt(p.year, p.month, p.day);
      if (date.getTime() >= openAt.getTime() && date.getTime() < closeAt.getTime()) {
        return "Closes in " + formatEta(closeAt.getTime() - date.getTime());
      }
      if (date.getTime() < openAt.getTime()) {
        return "Opens in " + formatEta(openAt.getTime() - date.getTime());
      }
    }
    var next = nextNyseTradingDay(p.year, p.month, p.day, 1);
    if (!next) return "";
    var nextOpen = nyseOpenAt(next.year, next.month, next.day);
    var nextParts = parts(nextOpen, "America/New_York");
    if (p.weekday === "Sat" || p.weekday === "Sun") {
      return "Opens " + nextParts.weekday;
    }
    var tomorrow = addDays(p.year, p.month, p.day, 1);
    var isTomorrow = tomorrow.year === next.year && tomorrow.month === next.month && tomorrow.day === next.day;
    if (!isTomorrow) return "Opens " + nextParts.weekday;
    return "Opens in " + formatEta(nextOpen.getTime() - date.getTime());
  }

  function shouldNightlyReload(now, lastKey) {
    var p = parts(now, "America/New_York");
    var inWindow = p.hour === 3 && p.minute >= 15 && p.minute <= 20;
    return inWindow && lastKey !== p.key;
  }

  function isDataStale(updatedAt, now) {
    var t = Date.parse(updatedAt);
    if (!isFinite(t)) return true;
    var age = now.getTime() - t;
    if (age < 0) return true;
    var p = parts(now, "UTC");
    var weekday = p.weekday !== "Sat" && p.weekday !== "Sun";
    var limitMin = weekday && p.hour >= 7 && p.hour < 22 ? 90 : 8 * 60;
    return age > limitMin * 60 * 1000;
  }

  root.MarketHours = {
    parts: parts,
    formatClock: formatClock,
    isOpen: isOpen,
    badge: badge,
    nyseCountdown: nyseCountdown,
    shouldNightlyReload: shouldNightlyReload,
    isDataStale: isDataStale,
    normalizeMarket: normalizeMarket,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
