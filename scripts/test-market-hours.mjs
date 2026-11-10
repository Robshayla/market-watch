import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, "../js/market-hours.js"), "utf8");
const sandbox = { console, Intl, Date, Math, Object, Number, isFinite, String };
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox, { filename: "market-hours.js" });
const MH = sandbox.MarketHours;

let failed = 0;
function check(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  }
}

function at(iso) {
  return new Date(iso);
}

function offsetMinutes(date, timeZone) {
  const p = MH.parts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

check(MH.formatClock(at("2026-11-01T16:00:00Z"), "America/New_York") === "11:00 AM", "Whippany EST");
check(MH.formatClock(at("2026-11-01T16:00:00Z"), "America/Chicago") === "10:00 AM", "Bentonville CST");
check(MH.formatClock(at("2026-11-01T16:00:00Z"), "Europe/Berlin") === "5:00 PM", "Leverkusen CET");
check(MH.formatClock(at("2026-11-01T16:00:00Z"), "Europe/Zurich") === "5:00 PM", "Basel CET");

check(MH.formatClock(at("2026-11-01T16:00:00Z"), "Europe/London") === "4:00 PM", "London GMT");
check(MH.formatClock(at("2026-11-01T16:00:00Z"), "Asia/Shanghai") === "12:00 AM", "Beijing CST midnight");
check(offsetMinutes(at("2026-11-01T16:00:00Z"), "Europe/London") === 0, "London GMT offset");
check(offsetMinutes(at("2026-11-01T16:00:00Z"), "Asia/Shanghai") === 480, "Beijing CST offset");
check(offsetMinutes(at("2026-07-15T16:00:00Z"), "Europe/London") === 60, "London BST");
check(offsetMinutes(at("2026-07-15T16:00:00Z"), "Asia/Shanghai") === 480, "Beijing no DST");
check(MH.formatClock(at("2026-07-15T16:00:00Z"), "Europe/London") === "5:00 PM", "summer London clock");
check(MH.formatClock(at("2026-07-15T16:00:00Z"), "Asia/Shanghai") === "12:00 AM", "summer Beijing clock");

check(offsetMinutes(at("2026-11-01T16:00:00Z"), "America/New_York") === -300, "NY EST offset");
check(offsetMinutes(at("2026-11-01T16:00:00Z"), "America/Chicago") === -360, "Chicago CST offset");
check(offsetMinutes(at("2026-11-01T16:00:00Z"), "Europe/Berlin") === 60, "Berlin CET offset");
check(offsetMinutes(at("2026-11-01T16:00:00Z"), "Europe/Zurich") === 60, "Zurich CET offset");

check(offsetMinutes(at("2026-07-15T16:00:00Z"), "America/New_York") === -240, "NY EDT");
check(offsetMinutes(at("2026-07-15T16:00:00Z"), "America/Chicago") === -300, "Chicago CDT");
check(offsetMinutes(at("2026-07-15T16:00:00Z"), "Europe/Berlin") === 120, "Berlin CEST");
check(offsetMinutes(at("2026-07-15T16:00:00Z"), "Europe/Zurich") === 120, "Zurich CEST");
check(MH.formatClock(at("2026-07-15T16:00:00Z"), "America/New_York") === "12:00 PM", "summer NY clock");
check(MH.formatClock(at("2026-07-15T16:00:00Z"), "Europe/Berlin") === "6:00 PM", "summer Berlin clock");

/* US already on DST, Europe still on standard time. */
check(offsetMinutes(at("2026-03-20T16:00:00Z"), "America/New_York") === -240, "Mar 20 NY EDT");
check(offsetMinutes(at("2026-03-20T16:00:00Z"), "Europe/Berlin") === 60, "Mar 20 Berlin CET");
check(MH.formatClock(at("2026-03-20T16:00:00Z"), "America/New_York") === "12:00 PM", "shoulder NY");
check(MH.formatClock(at("2026-03-20T16:00:00Z"), "Europe/Berlin") === "5:00 PM", "shoulder Berlin");

/* Europe already standard, US still on DST (Oct 28 2026). */
check(offsetMinutes(at("2026-10-28T16:00:00Z"), "America/New_York") === -240, "Oct 28 NY EDT");
check(offsetMinutes(at("2026-10-28T16:00:00Z"), "Europe/Berlin") === 60, "Oct 28 Berlin CET");

/* US spring-forward and fall-back instants. */
check(MH.formatClock(at("2026-03-08T06:30:00Z"), "America/New_York") === "1:30 AM", "before US spring forward");
check(MH.formatClock(at("2026-03-08T07:30:00Z"), "America/New_York") === "3:30 AM", "after US spring forward");
check(offsetMinutes(at("2026-11-01T05:30:00Z"), "America/New_York") === -240, "before US fall back");
check(offsetMinutes(at("2026-11-01T06:30:00Z"), "America/New_York") === -300, "after US fall back");

check(MH.badge("nyse", at("2026-11-01T16:00:00Z")).text === "NYSE CLOSED", "Sunday NYSE");
check(MH.badge("xetra", at("2026-11-01T16:00:00Z")).text === "XETRA CLOSED", "Sunday Xetra");
check(!MH.isOpen("nyse", at("2026-10-31T16:00:00Z")), "Saturday NYSE");

/* Friday Oct 30 2026, US still EDT, Europe CET. */
check(MH.isOpen("nyse", at("2026-10-30T13:29:00Z")) === false, "9:29 AM ET closed");
check(MH.isOpen("nyse", at("2026-10-30T13:30:00Z")) === true, "9:30 AM ET open");
check(MH.isOpen("nyse", at("2026-10-30T19:59:00Z")) === true, "3:59 PM ET open");
check(MH.isOpen("nyse", at("2026-10-30T20:00:00Z")) === false, "4:00 PM ET closed");
check(MH.isOpen("xetra", at("2026-10-30T07:59:00Z")) === false, "8:59 CET closed");
check(MH.isOpen("xetra", at("2026-10-30T08:00:00Z")) === true, "9:00 CET open");
check(MH.isOpen("xetra", at("2026-10-30T16:29:00Z")) === true, "17:29 CET open");
check(MH.isOpen("xetra", at("2026-10-30T16:30:00Z")) === false, "17:30 CET closed");
check(MH.isOpen("us", at("2026-10-30T15:00:00Z")) === true, "us alias follows NYSE");
check(MH.isOpen("otc", at("2026-10-30T15:00:00Z")) === true, "otc alias follows NYSE");

/* LSE 08:00–16:30 London, weekdays. Nov 10 2026 is a Tuesday on GMT. */
check(MH.isOpen("lse", at("2026-11-10T07:59:00Z")) === false, "7:59 London LSE closed");
check(MH.isOpen("lse", at("2026-11-10T08:00:00Z")) === true, "8:00 London LSE open");
check(MH.isOpen("london", at("2026-11-10T16:29:00Z")) === true, "16:29 London LSE open");
check(MH.isOpen("lse", at("2026-11-10T16:30:00Z")) === false, "16:30 London LSE closed");
check(MH.isOpen("lse", at("2026-07-15T06:59:00Z")) === false, "7:59 BST LSE closed");
check(MH.isOpen("lse", at("2026-07-15T07:00:00Z")) === true, "8:00 BST LSE open");
check(MH.isOpen("lse", at("2026-11-07T12:00:00Z")) === false, "Saturday LSE closed");
check(MH.badge("lse", at("2026-11-10T12:00:00Z")).text === "LSE OPEN", "LSE badge open");
check(MH.badge("lse", at("2026-11-10T17:00:00Z")).text === "LSE CLOSED", "LSE badge closed");

/* SSE 09:30–11:30 and 13:00–15:00 Beijing, weekdays. China has no DST (UTC+8). */
check(MH.isOpen("sse", at("2026-11-10T01:29:00Z")) === false, "9:29 Beijing SSE closed");
check(MH.isOpen("sse", at("2026-11-10T01:30:00Z")) === true, "9:30 Beijing SSE open");
check(MH.isOpen("sse", at("2026-11-10T03:29:00Z")) === true, "11:29 Beijing SSE open");
check(MH.isOpen("sse", at("2026-11-10T03:30:00Z")) === false, "11:30 Beijing SSE lunch closed");
check(MH.isOpen("shanghai", at("2026-11-10T04:59:00Z")) === false, "12:59 Beijing SSE lunch closed");
check(MH.isOpen("sse", at("2026-11-10T05:00:00Z")) === true, "13:00 Beijing SSE open");
check(MH.isOpen("sse", at("2026-11-10T06:59:00Z")) === true, "14:59 Beijing SSE open");
check(MH.isOpen("sse", at("2026-11-10T07:00:00Z")) === false, "15:00 Beijing SSE closed");
check(MH.isOpen("sse", at("2026-11-07T03:00:00Z")) === false, "Saturday SSE closed");
check(MH.badge("sse", at("2026-11-10T02:00:00Z")).text === "SSE OPEN", "SSE badge morning open");
check(MH.badge("sse", at("2026-11-10T04:00:00Z")).text === "SSE CLOSED", "SSE badge lunch closed");

/* NYSE countdown under the Bentonville clock. */
check(MH.nyseCountdown(at("2026-10-30T13:00:00Z")) === "Opens in 30m", "Friday 9:00 AM EDT opens soon");
check(MH.nyseCountdown(at("2026-10-30T13:30:00Z")) === "Closes in 6h 30m", "Friday 9:30 AM EDT just opened");
check(MH.nyseCountdown(at("2026-10-30T20:00:00Z")) === "Opens Mon", "Friday 4:00 PM EDT after close");
check(MH.nyseCountdown(at("2026-10-31T16:00:00Z")) === "Opens Mon", "Saturday");
check(MH.nyseCountdown(at("2026-11-01T16:00:00Z")) === "Opens Mon", "Sunday");
check(MH.nyseCountdown(at("2026-11-02T13:00:00Z")) === "Opens in 1h 30m", "Monday 8:00 AM EST");
check(MH.nyseCountdown(at("2026-11-02T15:00:00Z")) === "Closes in 6h 00m", "Monday 10:00 AM EST");
check(MH.nyseCountdown(at("2026-11-05T21:00:00Z")) === "Opens in 17h 30m", "Thursday after close to Friday open");
check(MH.nyseCountdown(at("2026-11-25T21:00:00Z")) === "Opens Fri", "Wednesday before Thanksgiving after close");
check(MH.nyseCountdown(at("2026-11-27T17:00:00Z")) === "Closes in 1h 00m", "Friday after Thanksgiving still open at noon");
check(MH.nyseCountdown(at("2026-11-27T19:00:00Z")) === "Opens Mon", "Friday after Thanksgiving early close");
check(MH.nyseCountdown(at("2026-05-24T20:00:00Z")) === "Opens Tue", "Sunday before Memorial Day 2026");

/* Holidays. */
check(!MH.isOpen("nyse", at("2026-01-01T17:00:00Z")), "NYSE New Year 2026");
check(!MH.isOpen("xetra", at("2026-01-01T12:00:00Z")), "Xetra New Year 2026");
check(!MH.isOpen("nyse", at("2026-04-03T16:00:00Z")), "NYSE Good Friday 2026");
check(!MH.isOpen("xetra", at("2026-04-03T12:00:00Z")), "Xetra Good Friday 2026");
check(MH.isOpen("nyse", at("2026-04-06T16:00:00Z")), "NYSE open Easter Monday");
check(!MH.isOpen("xetra", at("2026-04-06T12:00:00Z")), "Xetra Easter Monday");
check(MH.isOpen("nyse", at("2026-05-01T14:00:00Z")), "NYSE open German Labour Day");
check(!MH.isOpen("xetra", at("2026-05-01T12:00:00Z")), "Xetra Labour Day");
check(!MH.isOpen("nyse", at("2026-05-25T16:00:00Z")), "NYSE Memorial Day 2026");
check(MH.isOpen("xetra", at("2026-05-25T12:00:00Z")), "Xetra open Memorial Day");
check(!MH.isOpen("nyse", at("2026-06-19T16:00:00Z")), "NYSE Juneteenth 2026");
check(MH.isOpen("xetra", at("2026-06-19T12:00:00Z")), "Xetra open Juneteenth");
check(!MH.isOpen("nyse", at("2026-07-03T14:00:00Z")), "NYSE Independence observed");
check(MH.isOpen("xetra", at("2026-07-03T12:00:00Z")), "Xetra open July 3 2026");
check(!MH.isOpen("nyse", at("2026-11-26T17:00:00Z")), "NYSE Thanksgiving 2026");
check(MH.isOpen("xetra", at("2026-11-26T12:00:00Z")), "Xetra open Thanksgiving");
check(MH.isOpen("nyse", at("2026-11-27T17:00:00Z")), "NYSE early-close day still open at noon");
check(!MH.isOpen("nyse", at("2026-11-27T18:00:00Z")), "NYSE closed at 1:00 PM early close");
check(MH.isOpen("nyse", at("2026-12-24T17:00:00Z")), "NYSE Christmas Eve morning open");
check(!MH.isOpen("nyse", at("2026-12-24T18:00:00Z")), "NYSE Christmas Eve afternoon closed");
check(!MH.isOpen("xetra", at("2026-12-24T12:00:00Z")), "Xetra Christmas Eve closed");
check(!MH.isOpen("xetra", at("2026-12-31T12:00:00Z")), "Xetra New Year's Eve");
check(MH.isOpen("nyse", at("2026-12-31T17:00:00Z")), "NYSE open New Year's Eve 2026");

/* 2027–2028 published dates. */
check(!MH.isOpen("nyse", at("2027-06-18T16:00:00Z")), "Juneteenth observed Friday 2027");
check(!MH.isOpen("nyse", at("2027-07-05T16:00:00Z")), "Independence observed Monday 2027");
check(MH.isOpen("nyse", at("2027-07-02T16:00:00Z")), "Friday before observed July 4 is a full session");
check(!MH.isOpen("nyse", at("2027-12-24T17:00:00Z")), "Christmas observed Friday 2027");
check(MH.isOpen("nyse", at("2028-01-03T15:00:00Z")), "No NYSE observance when New Year is Saturday");
check(MH.isOpen("xetra", at("2028-01-03T15:00:00Z")), "Xetra does not shift New Year off Saturday");
check(!MH.isOpen("nyse", at("2028-07-03T17:00:00Z")), "July 3 2028 early close at 1 PM ET");
check(MH.isOpen("nyse", at("2028-07-03T16:00:00Z")), "July 3 2028 still open late morning");
check(!MH.isOpen("xetra", at("2028-12-26T15:00:00Z")), "Xetra Boxing Day 2028");
check(MH.isOpen("nyse", at("2028-12-26T15:00:00Z")), "NYSE open Boxing Day 2028");
check(MH.isOpen("xetra", at("2026-05-14T12:00:00Z")), "Xetra open Ascension 2026");
check(MH.isOpen("xetra", at("2026-05-25T12:00:00Z")), "Xetra open Whit Monday");

check(MH.shouldNightlyReload(at("2026-11-02T08:15:00Z"), "") === true, "reload at 3:15 AM ET");
check(MH.shouldNightlyReload(at("2026-11-02T08:15:00Z"), "2026-11-02") === false, "reload once");
check(MH.shouldNightlyReload(at("2026-11-02T08:10:00Z"), "") === false, "before reload window");
check(MH.shouldNightlyReload(at("2026-11-02T08:21:00Z"), "") === false, "after reload window");
check(MH.shouldNightlyReload(at("2026-07-15T07:15:00Z"), "") === true, "reload window during EDT");

const wed = at("2026-10-28T15:00:00Z");
check(MH.isDataStale(new Date(wed.getTime() - 10 * 60 * 1000).toISOString(), wed) === false, "fresh on a weekday");
check(MH.isDataStale(new Date(wed.getTime() - 2 * 60 * 60 * 1000).toISOString(), wed) === true, "stale after 2h weekday");
const sun = at("2026-11-01T16:00:00Z");
check(MH.isDataStale(new Date(sun.getTime() - 3 * 60 * 60 * 1000).toISOString(), sun) === false, "weekend 3h still fresh");
check(MH.isDataStale(new Date(sun.getTime() - 9 * 60 * 60 * 1000).toISOString(), sun) === true, "weekend 9h stale");
check(MH.isDataStale("nope", sun) === true, "bad timestamp stale");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("market-hours ok");
