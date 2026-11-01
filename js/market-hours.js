/* Market session clocks for the lobby display.
   NYSE holidays and early closes follow the NYSE Group calendars published for
   2026–2028 (ICE, December 2025) and the same observance rules after that.
   Xetra closures follow the Deutsche Börse FWB calendars: New Year's Day,
   Good Friday, Easter Monday, Labour Day, Christmas Eve, Christmas Day,
   Boxing Day, and New Year's Eve, with no weekend observance shift.
   Session times are interpreted in the exchange's IANA zone, so DST is
   handled by the runtime timezone database. */
(function (root) {
  "use strict";

  var NYSE_OPEN = 9 * 60 + 30;
  var NYSE_CLOSE = 16 * 60;
  var NYSE_EARLY_CLOSE = 13 * 60;
  var XETRA_OPEN = 9 * 60;
  var XETRA_CLOSE = 17 * 60 + 30;

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
      closureCache[key] = {
        closed: market === "xetra" ? xetraClosures(year) : nyseClosures(year),
        early: market === "xetra" ? Object.create(null) : nyseEarlyCloses(year),
      };
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
    return null;
  }

  function isOpen(market, date) {
    var canon = normalizeMarket(market);
    if (!canon) return false;
    var zone = canon === "xetra" ? "Europe/Berlin" : "America/New_York";
    var p = parts(date, zone);
    if (p.weekday === "Sat" || p.weekday === "Sun") return false;
    var book = closuresFor(canon, p.year);
    if (book.closed[p.key]) return false;
    var minute = p.hour * 60 + p.minute;
    var open = canon === "xetra" ? XETRA_OPEN : NYSE_OPEN;
    var close = canon === "xetra" ? XETRA_CLOSE : book.early[p.key] ? NYSE_EARLY_CLOSE : NYSE_CLOSE;
    return minute >= open && minute < close;
  }

  function badge(market, date) {
    var canon = normalizeMarket(market);
    var open = isOpen(canon, date);
    var name = canon === "xetra" ? "XETRA" : "NYSE";
    return { open: open, text: name + (open ? " OPEN" : " CLOSED") };
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
    shouldNightlyReload: shouldNightlyReload,
    isDataStale: isDataStale,
    normalizeMarket: normalizeMarket,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
