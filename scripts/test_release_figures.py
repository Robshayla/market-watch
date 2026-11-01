#!/usr/bin/env python3
"""Figures are shown only when an official page states them next to the event year."""

import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("fetch_market_data", ROOT / "fetch_market_data.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

GOOD = """
<h1>Bayer Q3 2026 Quarterly Statement</h1>
<p>Group sales in Q3 2026 were €10.5 billion.</p>
<p>EBITDA before special items in Q3 2026 reached €2.1 billion.</p>
"""
OLD = """
<h1>Archive</h1>
<p>Group sales in Q3 2025 were €9.9 billion.</p>
<p>EBITDA before special items in Q3 2025 reached €1.8 billion.</p>
"""
ONE = """
<h1>Q3 2026</h1>
<p>Group sales in Q3 2026 were €10.5 billion.</p>
"""

def labels(rows):
    return [row["label"] for row in rows] if rows else None

assert mod.parse_release_figures("", "2026") is None
assert mod.parse_release_figures(ONE, "2026") is None
assert mod.parse_release_figures(OLD, "2026") is None
parsed = mod.parse_release_figures(GOOD, "2026")
assert labels(parsed) == ["Group sales", "EBITDA before special items"], parsed
assert parsed[0]["value"] == "€10.5 billion"
print("release figures ok")
sys.exit(0)
