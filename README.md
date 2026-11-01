# Market Watch

Always-on lobby display for a Bayer office television. It shows Bayer AG (Xetra), the Bayer ADR, Walmart, four office clocks, headlines, and a market ticker. The page is static and is meant to run full screen on a Fire TV Stick.

**Live URL (after Pages is enabled and this branch is merged):** https://robshayla.github.io/market-watch/

## What the screen does

- Clocks for Whippany, Rogers, Leverkusen, and Basel, using IANA time zones so daylight saving time is applied automatically.
- NYSE open/closed under the two US clocks, and Xetra open/closed under the two European clocks. Weekends, the published NYSE holiday and early-close calendar, and the Deutsche Börse Xetra holiday calendar are included.
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
