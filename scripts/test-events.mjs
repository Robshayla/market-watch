import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { console, Intl, Date, Math, Object, Number, isFinite, String };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(here, "../js/market-hours.js"), "utf8"), sandbox, { filename: "market-hours.js" });
vm.runInNewContext(fs.readFileSync(path.join(here, "../js/events.js"), "utf8"), sandbox, { filename: "events.js" });
const Events = sandbox.Events;
const event = JSON.parse(fs.readFileSync(path.join(here, "../data/events.json"), "utf8")).events[0];

let failed = 0;
function check(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  }
}

const releaseTimes = Events.zoneTimes(event.moments[0].at, event.clocks);
const releaseLine = Events.formatZoneLine(releaseTimes);
check(releaseLine === "1:30 AM ET  ·  12:30 AM CT  ·  7:30 AM CET", "release zones " + releaseLine);

const mediaTimes = Events.zoneTimes(event.moments[1].at, event.clocks);
const mediaLine = Events.formatZoneLine(mediaTimes);
check(mediaLine === "4:00 AM ET  ·  3:00 AM CT  ·  10:00 AM CET", "media zones " + mediaLine);
check(Events.dateLabel(event.releaseAt, event.timezone) === "Tuesday, Nov 3", "release date label");

const before = new Date("2026-11-01T16:00:00Z");
check(Events.phase(event, before) === "before", "Nov 1 is before");
check(Events.highlightOn(event, before) === false, "no highlight before release");

const justAfter = new Date("2026-11-03T06:45:00Z");
check(Events.phase(event, justAfter) === "after", "15 min after release");
check(Events.highlightOn(event, justAfter) === true, "highlight on release day");
const mediaLeft = Events.nextMoment(event, justAfter);
check(mediaLeft && mediaLeft.moment.id === "media", "media update still ahead");

const laterThatNight = new Date("2026-11-03T22:30:00Z");
check(Events.phase(event, laterThatNight) === "after", "still Nov 3 evening CET");
check(Events.highlightOn(event, laterThatNight) === true, "highlight lasts through the Berlin release date");
const nextBerlinDay = new Date("2026-11-03T23:00:00Z");
check(Events.phase(event, nextBerlinDay) === "after", "banner stays up on Nov 4 CET");
check(Events.highlightOn(event, nextBerlinDay) === false, "highlight ends at midnight CET");

const endOfNov4 = new Date("2026-11-04T22:30:00Z");
check(Events.phase(event, endOfNov4) === "after", "visible late on Nov 4 CET");
check(Events.phase(event, new Date("2026-11-04T23:00:00Z")) === "hidden", "hidden at midnight Nov 5 CET");
check(Events.phase(event, new Date("2026-11-05T08:00:00Z")) === "hidden", "hidden on Nov 5");

const cd = Events.countdown(Date.parse("2026-11-03T06:30:00Z"), Date.parse("2026-11-01T16:00:00Z"));
check(cd.days === 1 && cd.hours === 14 && cd.mins === 30 && cd.secs === 0, "countdown " + JSON.stringify(cd));
check(Events.countdown(1000, 1000).done === true, "countdown done");

const forcedAfter = Events.previewNow(event, "after", before);
check(Events.phase(event, forcedAfter) === "after", "preview after");
check(Events.highlightOn(event, forcedAfter) === true, "preview after highlights");
const forcedBefore = Events.previewNow(event, "before", new Date("2026-11-05T12:00:00Z"));
check(Events.phase(event, forcedBefore) === "before", "preview before after the event");

const q3 = JSON.parse(fs.readFileSync(path.join(here, "../data/earnings_q3_2026.json"), "utf8"));
check(Events.earningsFilled(q3) === true, "q3 statement is ready to show");
check(Events.earningsFilled({ ready: true, group: { sales: "" } }) === false, "empty group is not ready");
check(Events.earningsFilled({
  ready: true,
  group: { sales: "€1", salesCpa: "+1%", ebitda: "€1", ebitdaChange: "+1%", margin: "10%", coreEps: "€1", coreEpsChange: "+1%", guidance: "held" },
  divisions: [1, 2, 3].map(() => ({ name: "D", sales: "€1", salesCpa: "+1%", ebitda: "€1", ebitdaChange: "+1%", bullets: ["one"] })),
}) === true, "complete earnings file is ready");

const off = { showResults: false, showReaction: false };
check(JSON.stringify(Events.rotationScreens(off, true, "", true)) === JSON.stringify(["board"]), "switches off stay on the board");
check(JSON.stringify(Events.rotationScreens({ showResults: true, showReaction: true }, false, "", true)) === JSON.stringify(["board", "reaction"]), "empty results stay hidden");
check(JSON.stringify(Events.rotationScreens({ showResults: true, showReaction: true }, true, "", true)) === JSON.stringify(["results", "board", "reaction"]), "results lead when switched on");
check(JSON.stringify(Events.rotationScreens(off, false, "", false)) === JSON.stringify(["board"]), "outside the window");
check(JSON.stringify(Events.rotationScreens(off, false, "results", false)) === JSON.stringify(["results"]), "preview results");
check(JSON.stringify(Events.rotationScreens(off, false, "reaction", false)) === JSON.stringify(["reaction"]), "preview reaction");
check(JSON.stringify(Events.rotationScreens(off, false, "rotation", false)) === JSON.stringify(["board", "results", "reaction"]), "preview rotation");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("events ok");
