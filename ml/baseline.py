"""Report the official (Open-Meteo best_match) forecast's MAE for daily highs and lows.

Reads daily.parquet written by ingest.py and prints MAE (deg C) by lead time and by
calendar month. Bias (mean of forecast - observed) is shown alongside MAE by lead:
positive means the forecast ran warm.

Usage: uv run python baseline.py [--data data/daily.parquet]
"""

from __future__ import annotations

import argparse
import calendar
from pathlib import Path

import pandas as pd


def mae_by_lead(daily: pd.DataFrame) -> pd.DataFrame:
    """One row per lead time: n days, MAE and bias for highs and lows."""
    g = daily.groupby("lead_days")
    out = pd.DataFrame(
        {
            "n": g.size(),
            "mae_high": g["err_high"].apply(lambda s: s.abs().mean()),
            "mae_low": g["err_low"].apply(lambda s: s.abs().mean()),
            "bias_high": g["err_high"].mean(),
            "bias_low": g["err_low"].mean(),
        }
    )
    out.index.name = "lead_days"
    return out


def mae_by_month(daily: pd.DataFrame) -> pd.DataFrame:
    """Calendar month (pooled across years) x lead: MAE of highs and lows, plus n days.

    Columns are a MultiIndex: ("high" | "low", lead_days) and ("n", lead_days).
    """
    df = daily.assign(
        month=daily["date"].dt.month,
        abs_high=daily["err_high"].abs(),
        abs_low=daily["err_low"].abs(),
    )
    g = df.groupby(["month", "lead_days"])
    wide = pd.DataFrame(
        {"high": g["abs_high"].mean(), "low": g["abs_low"].mean(), "n": g.size()}
    ).unstack("lead_days")
    wide.index = wide.index.map(lambda m: calendar.month_abbr[m])
    wide.index.name = "month"
    return wide


def report(daily: pd.DataFrame) -> str:
    start, end = daily["date"].min().date(), daily["date"].max().date()
    by_month = mae_by_month(daily)
    by_month.columns = [
        f"{v} L{lead}" if v != "n" else f"n L{lead}" for v, lead in by_month.columns
    ]
    lines = [
        f"Official forecast error, Toronto, {start} .. {end}  (deg C; L = lead in days)",
        "",
        "By lead time",
        mae_by_lead(daily).round(2).to_string(),
        "",
        "MAE by month",
        by_month.round(2).to_string(),
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--data", type=Path, default=Path(__file__).parent / "data" / "daily.parquet")
    args = p.parse_args(argv)
    if not args.data.exists():
        raise SystemExit(f"{args.data} not found; run `uv run python ingest.py` first")
    print(report(pd.read_parquet(args.data)))


if __name__ == "__main__":
    main()
