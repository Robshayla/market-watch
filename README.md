# Market Watch

Always-on lobby display for a Bayer office television. It shows Bayer AG (Xetra), the Bayer ADR, Walmart, a compact NVIDIA quote, five office clocks, headlines, and a market ticker. The page is static and is meant to run full screen on a Fire TV Stick.

**Live URL (after Pages is enabled and this branch is merged):** https://robshayla.github.io/market-watch/

## What the screen does

- Clocks for Whippany, NJ; Bentonville, AR; a combined Leverkusen / Basel clock on Central European time; London; and Beijing, using IANA time zones so daylight saving time is applied automatically.
- Open/closed badges: NYSE under the two US clocks, Xetra under Leverkusen / Basel, LSE under London (08:00–16:30 London time, weekdays), and SSE under Beijing (09:30–11:30 and 13:00–15:00 Beijing time, weekdays; closed over lunch). A clock picks up a soft green glow while its market is open. The Bentonville clock also shows a small NYSE countdown (for example “Closes in 2h 14m”, or “Opens Mon” on a weekend).
- Weekends, the published NYSE holiday and early-close calendar, and the Deutsche Börse Xetra holiday calendar are included. LSE and SSE use weekday session hours only and do not yet include holiday calendars.
- Quote tiles keep the last good price if a refresh fails, and show **At close** when that market is shut. The footer turns amber and adds **Stale** instead of going blank.
- Headlines rotate Bayer, Walmart, and US national top stories about every 12 seconds.
- The page re-reads `data/market.json` about every 60 seconds and reloads itself once a night at 3:15 AM Eastern so a stick left on for months does not slowly run out of memory.

## Data

A GitHub Actions workflow fetches everything with no API keys and deploys the site:

- Quotes and intraday sparklines: Yahoo Finance chart API (`query1` / `query2`), about 15 minutes delayed during the session. After the close, the figure is that session’s last sale.
- Walmart is checked against the Nasdaq last sale. Walmart lists on Nasdaq (it is not on the NYSE), so the tile says NASDAQ. US clocks still show the NYSE session, which matches Nasdaq’s cash hours.
- EUR/USD is the Yahoo spot rate, compared with the ECB reference rate from [Frankfurter](https://www.frankfurter.app/). The two series are not identical; a small gap is normal.
- Headlines: Google News RSS, with Yahoo Finance and NPR as fallbacks. Graphic crime headlines are left off the lobby rotation. Titles are shown with the publisher and time, not the article body.

The workflow runs every 15 minutes on weekdays from 07:00 to 21:59 UTC, once more after the US close, and three times a day on weekends. You can also run it by hand from the Actions tab (`Refresh data and deploy Pages`).

Office events live in `data/events.json`. The Q3 2026 entry counts down to the Nov 3, 7:30 a.m. CET release, then switches to a results-out banner through the end of Nov 4 CET. Add `?preview=before` or `?preview=after` to the page URL to photograph either state. A numbers strip appears only when the refresh job can read at least two labeled figures from the Bayer page for that year. Otherwise the board stays on headlines.

Two extra screens stay off until you turn them on. In the Q3 event set `showResults` and `showReaction` to `true`. Results copy is typed into `data/earnings_q3_2026.json`: set `ready` to `true` and fill `group` (sales, salesCpa, ebitda, ebitdaChange, margin, coreEps, coreEpsChange, guidance) plus each division's sales, salesCpa, ebitda, ebitdaChange, and bullets. The stock-reaction screen uses the fetched Nov 2 Xetra close (`referenceDate`) and leaves a dash where that close is missing. `?preview=reaction`, `?preview=consumer`, and `?preview=rotation` show those screens without flipping the switches. `?preview=results` is the only query that opens the Q3 results screen while it is suspended.

The Consumer Health “9 MONTHS 2026” spotlight stays out of the rotation while `showConsumer` is `false` in `data/events.json`. Set `showConsumer` back to `true` to return it. `?preview=consumer` still opens that screen on its own, and `?preview=rotation` shows the live rotation (MiraFIBER and the quote board while the spotlight is off). A MiraFIBER page leads that rotation while `earnings` is `false`. Set `earnings` back to `true` (with `showResults`) to put the Q3 results screen in that slot again. `?preview=mirafiber` opens the fiber page on its own. `?preview=results` still opens earnings without turning the flag on.

GitHub Pages may cache `data/market.json` for several minutes. Together with the quote delay, the board can lag the tape by roughly 15–30 minutes. That is expected.

## Fire TV Stick

1. Install **Fully Kiosk Browser** from the Amazon Appstore.
2. Set the start URL to `https://robshayla.github.io/market-watch/`.
3. Turn on kiosk mode and launch on boot. Turn off the Fully Kiosk screensaver and the Fire TV screensaver (Settings → Display & Sounds → Screensaver, or Device & Software).
4. Leave Fully’s own page reload off. The page already polls every minute and reloads overnight.
5. On the television, set the picture size to **Just Scan**, **Screen Fit**, or **Full Pixel**. The page also keeps a 3% margin on every edge so a set with overscan does not crop the clocks or the ticker.
6. The layout is drawn at 1920×1080 and scaled to fit, so a 720p stick shows the same composition.

The Bayer Cross is the official mark from [Wikimedia Commons, File:Logo Bayer.svg](https://commons.wikimedia.org/wiki/File:Logo_Bayer.svg) (SHA1 `4f762bd22dbc670970bc3b5f7747145698c3d740`). It is a Bayer trademark. This display uses the white one-color treatment on a dark background for an internal office screen. The Walmart tile uses the 2025 Spark from [Wikimedia Commons, File:Walmart spark (2025).svg](https://commons.wikimedia.org/wiki/File:Walmart_spark_(2025).svg) (SHA1 `aa71537bd10acd4b430dca7d77a429cdbe90c079`), in Spark Yellow. Both marks are trademarks. Do not reuse them for anything else without the owner’s approval.

## One-time setup for the repo owner

1. Merge the pull request into `main`. The deploy workflow only publishes from `main`.
2. If GitHub asks, approve the workflow under Actions. New scheduled workflows sometimes wait for a maintainer the first time.
3. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions** if it is not already. The public site is then https://robshayla.github.io/market-watch/
4. Under **Settings → Actions → General → Workflow permissions**, allow Actions to read and write if the scheduled job cannot commit `data/market.json`. The site still deploys the fresh file when that commit is rejected; the copy in the repo is only so the data is visible in git.

Confirm the first Actions run is green. A failed fetch keeps the previous `data/market.json` and the screen keeps showing it.
