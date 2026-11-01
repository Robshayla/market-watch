#!/usr/bin/env python3
"""Fetch delayed quotes and headlines into data/market.json.

Uses only keyless public endpoints. Quote prices come from the Yahoo Finance
chart API. Walmart is cross-checked against the Nasdaq last sale, and EUR/USD
is compared with the ECB reference rate from Frankfurter. On a partial
failure the previous good value for that symbol is kept.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "market.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")

# Day-change is price minus previousClose. Yahoo's fulldayChange field can
# disagree with the official previous close (observed on WMT); do not use it.
QUOTES = (
    {
        "id": "bayn",
        "symbol": "BAYN.DE",
        "name": "BAYER AG",
        "ticker": "BAYN",
        "venue": "Frankfurt",
        "currency": "EUR",
        "session": "xetra",
        "kind": "EQUITY",
        "name_contains": "bayer",
        "exchange_contains": "xetra",
        "open_min": 9 * 60,
        "close_min": 17 * 60 + 30,
        "digits": 2,
    },
    {
        "id": "bayry",
        "symbol": "BAYRY",
        "name": "BAYER ADR",
        "ticker": "BAYRY",
        "venue": "OTC",
        "currency": "USD",
        "session": "us",
        "kind": "EQUITY",
        "name_contains": "bayer",
        "exchange_contains": "otc",
        "open_min": 9 * 60 + 30,
        "close_min": 16 * 60,
        "digits": 2,
    },
    {
        "id": "wmt",
        "symbol": "WMT",
        "name": "WALMART",
        "ticker": "WMT",
        "venue": "NASDAQ",
        "currency": "USD",
        "session": "us",
        "kind": "EQUITY",
        "name_contains": "walmart",
        "exchange_contains": "nasdaq",
        "open_min": 9 * 60 + 30,
        "close_min": 16 * 60,
        "digits": 2,
    },
)

TICKERS = (
    {
        "id": "sp500",
        "symbol": "^GSPC",
        "name": "S&P 500",
        "currency": "USD",
        "kind": "INDEX",
        "name_contains": "s&p 500",
        "digits": 2,
        "min_price": 2000,
        "max_price": 20000,
    },
    {
        "id": "dow",
        "symbol": "^DJI",
        "name": "DOW",
        "currency": "USD",
        "kind": "INDEX",
        "name_contains": "dow jones",
        "digits": 2,
        "min_price": 10000,
        "max_price": 100000,
    },
    {
        "id": "dax",
        "symbol": "^GDAXI",
        "name": "DAX",
        "currency": "EUR",
        "kind": "INDEX",
        "name_contains": "dax",
        "digits": 2,
        "min_price": 8000,
        "max_price": 40000,
    },
    {
        "id": "eurusd",
        "symbol": "EURUSD=X",
        "name": "EUR/USD",
        "currency": "USD",
        "kind": "CURRENCY",
        "name_contains": "eur/usd",
        "digits": 4,
        "min_price": 0.7,
        "max_price": 1.8,
    },
)

SPORTS = re.compile(
    r"bundesliga|champions league|\bfootball\b|\bsoccer\b|goalkeeper|"
    r"\bcoach\b|transfer window|bayer 04|bayer\s+leverkusen|matchday|werkself",
    re.I,
)
GRAPHIC = re.compile(
    r"\b(shootings?|shot dead|killed|killing|murder|rape|massacre|stabbing|fatally)\b|"
    r"\bdead\b|\binjured\b",
    re.I,
)
SHOPPING = re.compile(
    r"\d+% off|\bon sale\b|\bis selling\b|comes with|\bclearance\b|\bshoppers?\b|for only \$",
    re.I,
)
BOILER = re.compile(
    r"\b(shares|stock|stake|holdings)\b.{0,48}\b(sold|bought|purchased|held) by\b|"
    r"\b(increases|decreases|raises|lowers|reduces|cuts|lifted|trimmed)\b.{0,24}\b(stake|holdings|position)\b|"
    r"\b(stake|holdings|position)\b.{0,24}\b(increased|decreased|raised|lowered|reduced|cut|lifted|trimmed)\b|"
    r"\betfs add\b",
    re.I,
)

HEADLINE_FEEDS = {
    "bayer": [
        "https://news.google.com/rss/search?q=%22Bayer+AG%22+OR+%22Bayer%22+(shares+OR+stock+OR+crop+OR+pharma+OR+pharmaceutical)&hl=en-US&gl=US&ceid=US:en",
        "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BAYN.DE&region=US&lang=en-US",
    ],
    "walmart": [
        "https://news.google.com/rss/search?q=Walmart+(earnings+OR+shares+OR+stock+OR+sales+OR+revenue+OR+CEO+OR+employees+OR+lawsuit+OR+acquisition+OR+guidance)&hl=en-US&gl=US&ceid=US:en",
        "https://feeds.finance.yahoo.com/rss/2.0/headline?s=WMT&region=US&lang=en-US",
    ],
    "top": [
        "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en",
        "https://feeds.npr.org/1001/rss.xml",
    ],
}


def fetch_bytes(url: str, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"{url} failed: {last}")


def fetch_json(url: str) -> dict:
    return json.loads(fetch_bytes(url, "application/json").decode("utf-8"))


def fetch_chart(symbol: str) -> dict:
    quoted = urllib.parse.quote(symbol)
    last = None
    for host in HOSTS:
        url = (
            f"https://{host}/v8/finance/chart/{quoted}"
            "?range=5d&interval=5m&includePrePost=false"
        )
        try:
            data = fetch_json(url)
        except Exception as exc:  # noqa: BLE001 - try the next host
            last = exc
            continue
        err = (data.get("chart") or {}).get("error")
        result = (data.get("chart") or {}).get("result") or []
        if err or not result:
            last = RuntimeError(err or "empty chart")
            continue
        return result[0]
    raise RuntimeError(f"{symbol}: {last}")


def session_sparkline(result: dict, open_min: int, close_min: int, price: float) -> list[float]:
    meta = result["meta"]
    zone = ZoneInfo(meta.get("exchangeTimezoneName") or "UTC")
    stamps = result.get("timestamp") or []
    closes = (result.get("indicators") or {}).get("quote", [{}])[0].get("close") or []
    by_day: dict[str, list[tuple[int, float]]] = {}
    for stamp, close in zip(stamps, closes):
        if close is None:
            continue
        local = datetime.fromtimestamp(stamp, zone)
        minute = local.hour * 60 + local.minute
        by_day.setdefault(local.date().isoformat(), []).append((minute, float(close)))
    if not by_day:
        return []
    day = sorted(by_day)[-1]
    regular = [value for minute, value in by_day[day] if open_min <= minute < close_min]
    series = regular if len(regular) >= 8 else [value for _, value in by_day[day]]
    if len(series) > 80:
        step = len(series) / 80
        series = [series[int(i * step)] for i in range(80)]
    if not series:
        return []
    midpoint = series[len(series) // 2]
    if price and abs(midpoint - price) / price > 0.15:
        raise ValueError("sparkline disagrees with the last price")
    if price and abs(series[-1] - price) > 0.02:
        series.append(price)
    return [round(value, 4) for value in series]


def build_quote(spec: dict) -> dict:
    result = fetch_chart(spec["symbol"])
    meta = result["meta"]
    symbol = meta.get("symbol")
    if symbol != spec["symbol"]:
        raise ValueError(f"symbol {symbol} != {spec['symbol']}")
    if (meta.get("currency") or "").upper() != spec["currency"]:
        raise ValueError(f"currency {meta.get('currency')}")
    if (meta.get("instrumentType") or "").upper() != spec["kind"]:
        raise ValueError(f"instrument {meta.get('instrumentType')}")
    long_name = (meta.get("longName") or meta.get("shortName") or "").lower()
    if spec["name_contains"] not in long_name:
        raise ValueError(f"name {meta.get('longName')!r}")
    exchange = (meta.get("fullExchangeName") or meta.get("exchangeName") or "").lower()
    if spec.get("exchange_contains") and spec["exchange_contains"] not in exchange:
        raise ValueError(f"exchange {exchange!r}")
    price = round(float(meta["regularMarketPrice"]), spec["digits"])
    previous = meta.get("previousClose")
    if previous is None:
        raise ValueError("missing previous close")
    previous = round(float(previous), spec["digits"])
    if price <= 0 or previous <= 0:
        raise ValueError("non-positive price")
    if spec.get("min_price") and not spec["min_price"] <= price <= spec["max_price"]:
        raise ValueError(f"price {price} outside sanity range")
    change = round(price - previous, spec["digits"])
    change_pct = (price - previous) / previous * 100
    if abs(change_pct) > 35:
        raise ValueError(f"implausible move {change_pct:.1f}%")
    as_of = datetime.fromtimestamp(int(meta["regularMarketTime"]), timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    payload = {
        "symbol": spec["symbol"],
        "name": spec["name"],
        "ticker": spec.get("ticker", spec["name"]),
        "venue": spec.get("venue", ""),
        "currency": spec["currency"],
        "session": spec.get("session", ""),
        "price": price,
        "previousClose": previous,
        "change": change,
        "changePct": round(change_pct, 4),
        "asOf": as_of,
        "digits": spec["digits"],
    }
    if "open_min" in spec:
        payload["sparkline"] = session_sparkline(result, spec["open_min"], spec["close_min"], price)
        if len(payload["sparkline"]) < 8:
            raise ValueError("sparkline too short")
    return payload


def nasdaq_last(symbol: str) -> float:
    data = fetch_json(f"https://api.nasdaq.com/api/quote/{symbol}/info?assetclass=stocks")
    raw = data["data"]["primaryData"]["lastSalePrice"]
    return float(raw.replace("$", "").replace(",", ""))


def check_wmt(price: float) -> str:
    try:
        official = nasdaq_last("WMT")
    except Exception as exc:  # noqa: BLE001
        print(f"nasdaq check skipped: {exc}", file=sys.stderr)
        return "nasdaq check skipped"
    if abs(official - price) > 0.05:
        raise ValueError(f"WMT Yahoo {price} != Nasdaq {official}")
    return f"Nasdaq last sale {official:.2f} matched"


def check_eur(price: float) -> str:
    try:
        data = fetch_json("https://api.frankfurter.app/latest?from=EUR&to=USD")
        ecb = float(data["rates"]["USD"])
        day = data.get("date")
    except Exception as exc:  # noqa: BLE001
        print(f"ECB check skipped: {exc}", file=sys.stderr)
        return "ECB check skipped"
    gap = abs(ecb - price) / price * 100
    note = f"ECB reference {ecb:.4f} on {day} vs Yahoo spot {price:.4f}"
    if gap > 2:
        print("warning: " + note, file=sys.stderr)
    return note


def parse_when(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def clean_source(source: str) -> str:
    source = re.sub(r"\s+", " ", source).strip()
    source = re.sub(r"\.com$", "", source, flags=re.I)
    return source[:40]


def parse_feed(url: str) -> list[dict]:
    root = ET.fromstring(fetch_bytes(url, "application/rss+xml, application/xml, text/xml"))
    items = []
    for node in root.findall(".//item"):
        title = (node.findtext("title") or "").strip()
        source = (node.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)].strip()
        elif not source and " - " in title:
            title, source = title.rsplit(" - ", 1)
            title = title.strip()
            source = source.strip()
        byline = re.search(r"\s+by\s+(reuters|bloomberg|associated press)\s*$", title, re.I)
        if byline:
            source = byline.group(1)
            title = title[: byline.start()].strip()
        source = clean_source(source)
        if not source and "finance.yahoo.com" in url:
            source = "Yahoo Finance"
        if not source and "npr.org" in url:
            source = "NPR"
        when = parse_when(node.findtext("pubDate"))
        if not title or when is None:
            continue
        items.append(
            {
                "title": title[:240],
                "source": source,
                "publishedAt": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "_when": when,
            }
        )
    return items


def accept_headline(bucket: str, item: dict) -> bool:
    title = item["title"]
    if GRAPHIC.search(title):
        return False
    if bucket == "bayer":
        if SPORTS.search(title):
            return False
        if "bayer" not in title.lower():
            return False
    if bucket == "walmart" and "walmart" not in title.lower():
        return False
    if bucket in ("bayer", "walmart") and (SHOPPING.search(title) or BOILER.search(title)):
        return False
    if re.search(r"\bstock forecasts?\b", title, re.I):
        return False
    return True


PREFERRED_SOURCE = re.compile(
    r"reuters|bloomberg|wall street journal|\bwsj\b|financial times|"
    r"associated press|\bap\b|bbc|cnbc|business journal|fierce|"
    r"new york times|washington post|business insider|fierce|\binc\.|\binc\b|"
    r"fortune|\bforbes\b|handelsblatt|economist",
    re.I,
)
LOW_SOURCE = re.compile(
    r"ad-hoc-news|simply wall|motley fool|24/7 wall|trefis|investorplace|"
    r"marketbeat|benzinga|zacks",
    re.I,
)


def source_rank(item: dict) -> int:
    blob = f"{item.get('source', '')} {item['title']}"
    if LOW_SOURCE.search(blob):
        return 0
    if PREFERRED_SOURCE.search(blob):
        return 2
    return 1


def headlines_for(bucket: str, urls: list[str]) -> list[dict]:
    collected: list[dict] = []
    for url in urls:
        try:
            collected.extend(parse_feed(url))
        except Exception as exc:  # noqa: BLE001
            print(f"headline feed failed {url}: {exc}", file=sys.stderr)
    seen = set()
    chosen = []
    ranked = sorted(collected, key=lambda row: (source_rank(row), row["_when"]), reverse=True)
    for item in ranked:
        if not accept_headline(bucket, item):
            continue
        key = re.sub(r"[^a-z0-9]+", " ", item["title"].lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        chosen.append(
            {
                "title": item["title"],
                "source": item["source"],
                "publishedAt": item["publishedAt"],
            }
        )
        if len(chosen) == 4:
            break
    return chosen


FIGURE_LABELS = (
    ("ebitda before special items", "EBITDA before special items"),
    ("core earnings per share", "Core earnings per share"),
    ("group sales", "Group sales"),
)


def parse_release_figures(html: str, year: str) -> list[dict] | None:
    """Return labeled figures only when the event year sits beside the amount.

    One match is not enough. A page that only restates an older year is ignored.
    """
    if not html or not year:
        return None
    text = re.sub(r"<[^>]+>", " ", html)
    text = html_lib.unescape(text)
    text = re.sub(r"\s+", " ", text)
    found: list[tuple[int, dict]] = []
    seen: set[str] = set()
    for needle, label in FIGURE_LABELS:
        for match in re.finditer(re.escape(needle), text, re.I):
            window = text[match.end() : match.end() + 160]
            context = text[max(0, match.start() - 24) : match.end() + 160]
            if year not in context:
                continue
            amount = re.search(
                r"([€$])\s*([0-9]+(?:[.,][0-9]+)?)\s*(billion|million)?",
                window,
                re.I,
            )
            if not amount or label in seen:
                continue
            unit = f" {amount.group(3).lower()}" if amount.group(3) else ""
            seen.add(label)
            found.append(
                (
                    match.start(),
                    {"label": label, "value": f"{amount.group(1)}{amount.group(2)}{unit}"},
                )
            )
            break
    if len(found) < 2:
        return None
    found.sort(key=lambda row: row[0])
    return [row[1] for row in found]


def load_events() -> list[dict]:
    path = ROOT / "data" / "events.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"events.json skipped: {exc}", file=sys.stderr)
        return []
    events = payload.get("events") if isinstance(payload, dict) else None
    return events if isinstance(events, list) else []


def _event_instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def collect_release_headlines(event: dict, previous: list[dict]) -> list[dict]:
    spec = event.get("headlines") or {}
    feeds = spec.get("feeds") or []
    require = [word.lower() for word in spec.get("require") or []]
    any_of = [word.lower() for word in spec.get("any") or []]
    try:
        start = _event_instant(event["releaseAt"]) - timedelta(hours=2)
        finish = _event_instant(event["hideAfter"])
    except (KeyError, ValueError) as exc:
        print(f"release window skipped: {exc}", file=sys.stderr)
        return []
    collected: list[dict] = []
    fetched = False
    for url in feeds:
        try:
            collected.extend(parse_feed(url))
            fetched = True
        except Exception as exc:  # noqa: BLE001
            print(f"release feed failed {url}: {exc}", file=sys.stderr)
    if not fetched:
        return [row for row in previous if row.get("eventId") == event.get("id")]
    chosen: list[dict] = []
    seen: set[str] = set()
    for item in sorted(collected, key=lambda row: row["_when"], reverse=True):
        when = item["_when"]
        if when < start or when > finish:
            continue
        blob = f"{item['title']} {item['source']}".lower()
        if any(word not in blob for word in require):
            continue
        if any_of and not any(word in blob for word in any_of):
            continue
        if SPORTS.search(item["title"]) or GRAPHIC.search(item["title"]):
            continue
        key = re.sub(r"[^a-z0-9]+", " ", item["title"].lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        chosen.append(
            {
                "eventId": event["id"],
                "title": item["title"],
                "source": item["source"] or "Bayer",
                "publishedAt": item["publishedAt"],
                "release": True,
            }
        )
        if len(chosen) == 4:
            break
    return chosen


def collect_release_figures(event: dict, previous: dict | None) -> dict | None:
    url = event.get("figuresPage") or ""
    year = str(event.get("figuresYear") or "")
    if "bayer.com" not in url or not year:
        return None
    try:
        html = fetch_bytes(url, "text/html").decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        print(f"figures page skipped: {exc}", file=sys.stderr)
        return previous
    parsed = parse_release_figures(html, year)
    if not parsed:
        print(f"no parseable figures for {event.get('id')}")
        return None
    print(f"figures {event.get('id')}: " + ", ".join(row["label"] for row in parsed))
    return {"source": url, "items": parsed}


def load_previous() -> dict | None:
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def main() -> int:
    previous = load_previous() or {}
    prev_quotes = previous.get("quotes") or {}
    prev_ticker = previous.get("ticker") or {}
    quotes: dict = {}
    ticker: dict = {}
    degraded = False
    notes = []

    for spec in QUOTES:
        try:
            built = build_quote(spec)
            if spec["id"] == "wmt":
                notes.append(check_wmt(built["price"]))
            quotes[spec["id"]] = built
            print(
                f"{built['symbol']} {built['price']} {built['currency']} "
                f"{built['change']:+} ({built['changePct']:+.2f}%) "
                f"as of {built['asOf']}"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {spec['symbol']}: {exc}", file=sys.stderr)
            if spec["id"] in prev_quotes:
                quotes[spec["id"]] = prev_quotes[spec["id"]]
                degraded = True
            else:
                print("no previous quote to keep", file=sys.stderr)
                return 1

    for spec in TICKERS:
        try:
            built = build_quote(spec)
            if spec["id"] == "eurusd":
                notes.append(check_eur(built["price"]))
            ticker[spec["id"]] = {
                "symbol": built["symbol"],
                "name": spec["name"],
                "price": built["price"],
                "change": built["change"],
                "changePct": built["changePct"],
                "digits": spec["digits"],
                "asOf": built["asOf"],
            }
            print(f"{built['symbol']} {built['price']} ({built['changePct']:+.2f}%)")
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {spec['symbol']}: {exc}", file=sys.stderr)
            if spec["id"] in prev_ticker:
                ticker[spec["id"]] = prev_ticker[spec["id"]]
                degraded = True
            else:
                return 1

    # Bayer ordinary vs ADR, roughly 4 ordinaries per ADR. Warn only.
    try:
        implied = quotes["bayn"]["price"] * ticker["eurusd"]["price"] / quotes["bayry"]["price"]
        if not 3.2 <= implied <= 4.8:
            print(f"warning: implied Bayer ADR ratio {implied:.2f}", file=sys.stderr)
        else:
            notes.append(f"Bayer ADR ratio check {implied:.2f} ordinary shares")
    except Exception as exc:  # noqa: BLE001
        print(f"ADR check skipped: {exc}", file=sys.stderr)

    headlines = {}
    for bucket, urls in HEADLINE_FEEDS.items():
        found = headlines_for(bucket, urls)
        if found:
            headlines[bucket] = found
        elif previous.get("headlines", {}).get(bucket):
            headlines[bucket] = previous["headlines"][bucket]
            print(f"keeping previous {bucket} headlines", file=sys.stderr)
        else:
            headlines[bucket] = []
        print(f"headlines {bucket}={len(headlines[bucket])}")

    releases: list[dict] = []
    release_figures: dict = {}
    previous_releases = previous.get("releases") or []
    previous_figures = previous.get("releaseFigures") or {}
    for event in load_events():
        event_id = event.get("id")
        releases.extend(collect_release_headlines(event, previous_releases))
        figures = collect_release_figures(event, previous_figures.get(event_id))
        if figures:
            release_figures[event_id] = figures
        print(f"release {event_id} headlines={sum(1 for row in releases if row.get('eventId') == event_id)}")

    payload = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "delayNote": "Quotes delayed 15 min",
        "degraded": degraded,
        "provenance": notes,
        "quotes": quotes,
        "ticker": ticker,
        "headlines": headlines,
        "releases": releases,
        "releaseFigures": release_figures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
