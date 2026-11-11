"""Backfill Toronto daily forecasts (lead 1-3 days) and observed highs/lows.

Forecasts come from the Open-Meteo Previous Runs API, actuals from the Historical
Weather API (ERA5 reanalysis). Both are fetched as *hourly* UTC series and turned
into daily highs/lows with the same function, because:

- The Previous Runs API has no daily variables; lead-time values exist only as
  hourly `temperature_2m_previous_dayN` (the value predicted N*24 h before that hour).
  So a "lead 1" daily high is the max over a local day of hours each forecast 24 h
  ahead, i.e. roughly "yesterday's forecast for today".
- Open-Meteo applies one fixed UTC offset to a whole request and ignores DST, so
  asking it for America/Toronto days would shift summer days by an hour. We fetch UTC
  and convert ourselves, so local days have 23/24/25 hours as appropriate.

Outputs (Parquet) in --out (default data/):
  forecast_hourly.parquet  time_utc, lead_days, temp_c
  actual_hourly.parquet    time_utc, temp_c
  daily.parquet            date, lead_days, fc_high, fc_low, obs_high, obs_low,
                           err_high, err_low   (err = forecast - observed, deg C)

Usage: uv run python ingest.py [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--out DIR]
"""

from __future__ import annotations

import argparse
import logging
import time
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

LAT, LON = 43.6532, -79.3832
TZ = "America/Toronto"
LEADS = (1, 2, 3)

PREVIOUS_RUNS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# ERA5 lands about 5 days late; until then the archive serves model analysis instead.
ARCHIVE_LAG_DAYS = 7
CHUNK_DAYS = 92
USER_AGENT = "skyline-ml/0.1 (forecast accuracy backfill)"

log = logging.getLogger("ingest")


# ---------------------------------------------------------------------------
# HTTP


class OpenMeteoError(RuntimeError):
    pass


def fetch_json(
    session: requests.Session, url: str, params: dict, retries: int = 4, backoff: float = 2.0
) -> dict:
    """GET JSON with retries on network errors, 429/5xx and empty or invalid bodies.

    Open-Meteo occasionally returns an empty 200 or stalls, so those are retried too.
    An explicit API error ({"error": true}) is raised immediately.
    """
    last = ""
    for attempt in range(retries + 1):
        try:
            res = session.get(url, params=params, timeout=60)
        except requests.RequestException as e:
            last = repr(e)
        else:
            if res.status_code == 429 or res.status_code >= 500:
                last = f"HTTP {res.status_code}"
            else:
                try:
                    payload = res.json()
                except ValueError:
                    last = f"HTTP {res.status_code} with non-JSON body {res.text[:80]!r}"
                else:
                    if isinstance(payload, dict) and payload.get("error"):
                        raise OpenMeteoError(
                            f"Open-Meteo rejected request: {payload.get('reason')}"
                        )
                    res.raise_for_status()
                    return payload
        if attempt < retries:
            wait = backoff * 2**attempt
            log.warning("%s failed (%s); retrying in %.0fs", url, last, wait)
            time.sleep(wait)
    raise OpenMeteoError(f"{url} failed after {retries + 1} attempts: {last}")


def date_chunks(start: date, end: date, days: int | None = None) -> Iterator[tuple[date, date]]:
    """Split [start, end] (inclusive) into consecutive inclusive ranges of <= `days` days."""
    days = days or CHUNK_DAYS
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=days - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


# ---------------------------------------------------------------------------
# Parsing and aggregation (pure; covered by tests)


def hourly_frame(payload: dict, variables: list[str]) -> pd.DataFrame:
    """Open-Meteo hourly block (requested with timezone=GMT) -> time_utc + variables."""
    if payload.get("utc_offset_seconds", 0) != 0:
        raise ValueError("expected a GMT/UTC response; request with timezone=GMT")
    h = payload["hourly"]
    missing = [v for v in variables if v not in h]
    if missing:
        raise ValueError(f"response is missing hourly variables: {missing}")
    df = pd.DataFrame({v: pd.to_numeric(pd.Series(h[v]), errors="coerce") for v in variables})
    df.insert(0, "time_utc", pd.to_datetime(pd.Series(h["time"])).dt.tz_localize("UTC"))
    return df


def forecast_long(wide: pd.DataFrame, leads: tuple[int, ...] = LEADS) -> pd.DataFrame:
    """Wide previous_dayN columns -> long rows (time_utc, lead_days, temp_c), nulls dropped."""
    cols = {f"temperature_2m_previous_day{n}": n for n in leads}
    long = wide.melt(id_vars="time_utc", value_vars=list(cols), var_name="var", value_name="temp_c")
    long["lead_days"] = long.pop("var").map(cols).astype("int64")
    long = long.dropna(subset=["temp_c"])
    return long[["time_utc", "lead_days", "temp_c"]].sort_values(["lead_days", "time_utc"])


def expected_hours(dates: pd.Series, tz: str = TZ) -> pd.Series:
    """Number of hours in each local calendar day (23 or 25 on DST changes)."""
    midnight = pd.DatetimeIndex(dates).tz_localize(tz)
    next_midnight = pd.DatetimeIndex(dates + pd.Timedelta(days=1)).tz_localize(tz)
    return pd.Series((next_midnight - midnight) / pd.Timedelta(hours=1), index=dates.index)


def hourly_to_daily(
    hourly: pd.DataFrame, by: list[str] | None = None, tz: str = TZ
) -> pd.DataFrame:
    """Hourly UTC temps -> local-day high/low, keeping only days with every hour present.

    `hourly` has time_utc (tz-aware), temp_c and any `by` columns (e.g. lead_days).
    Returns `by` + date (naive local midnight) + high + low.
    """
    by = list(by or [])
    df = hourly.dropna(subset=["temp_c"]).drop_duplicates(subset=by + ["time_utc"])
    local = df["time_utc"].dt.tz_convert(tz)
    df = df.assign(date=local.dt.tz_localize(None).dt.normalize())
    daily = df.groupby(by + ["date"], as_index=False).agg(
        high=("temp_c", "max"), low=("temp_c", "min"), n_hours=("temp_c", "size")
    )
    complete = daily["n_hours"] == expected_hours(daily["date"], tz)
    if (~complete).any():
        log.info("dropping %d incomplete day(s)", int((~complete).sum()))
    return daily.loc[complete, by + ["date", "high", "low"]].reset_index(drop=True)


def join_daily(forecast_daily: pd.DataFrame, actual_daily: pd.DataFrame) -> pd.DataFrame:
    """Pair each (date, lead) forecast high/low with that date's observed high/low.

    Inner join: days without an observation (or a forecast) are left out.
    Errors are forecast - observed, so positive means the forecast was too warm.
    """
    fc = forecast_daily.rename(columns={"high": "fc_high", "low": "fc_low"})
    obs = actual_daily.rename(columns={"high": "obs_high", "low": "obs_low"})
    out = fc.merge(obs, on="date", how="inner", validate="many_to_one")
    out["err_high"] = out["fc_high"] - out["obs_high"]
    out["err_low"] = out["fc_low"] - out["obs_low"]
    cols = ["date", "lead_days", "fc_high", "fc_low", "obs_high", "obs_low", "err_high", "err_low"]
    return out[cols].sort_values(["date", "lead_days"]).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Fetching


def _fetch_hourly(
    session: requests.Session, url: str, variables: list[str], start: date, end: date
) -> tuple[pd.DataFrame, dict]:
    """Fetch UTC hourly `variables` over [start, end] in chunks. Returns (frame, grid info)."""
    frames, grid = [], {}
    for lo, hi in date_chunks(start, end):
        payload = fetch_json(
            session,
            url,
            {
                "latitude": LAT,
                "longitude": LON,
                "timezone": "GMT",
                "hourly": ",".join(variables),
                "start_date": lo.isoformat(),
                "end_date": hi.isoformat(),
            },
        )
        grid = {
            "latitude": payload.get("latitude"),
            "longitude": payload.get("longitude"),
            "elevation": payload.get("elevation"),
        }
        frames.append(hourly_frame(payload, variables))
        log.info("%s %s..%s: %d hours", url.split("//")[1].split(".")[0], lo, hi, len(frames[-1]))
    df = pd.concat(frames, ignore_index=True).drop_duplicates(subset="time_utc")
    return df.sort_values("time_utc").reset_index(drop=True), grid


def _between(daily: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    return daily[(daily["date"] >= pd.Timestamp(start)) & (daily["date"] <= pd.Timestamp(end))]


def ingest(start: date, end: date, out: Path, session: requests.Session | None = None) -> dict:
    """Backfill local days [start, end] and write the three Parquet files to `out`."""
    if start > end:
        raise ValueError(f"start {start} is after end {end}")
    if session is None:
        session = requests.Session()
        session.headers["User-Agent"] = USER_AGENT
    # Toronto is UTC-4/-5, so local days [start, end] span UTC dates [start, end + 1].
    utc_start, utc_end = start, end + timedelta(days=1)

    fc_vars = [f"temperature_2m_previous_day{n}" for n in LEADS]
    fc_wide, fc_grid = _fetch_hourly(session, PREVIOUS_RUNS_URL, fc_vars, utc_start, utc_end)
    fc_hourly = forecast_long(fc_wide)
    act_hourly, act_grid = _fetch_hourly(
        session, ARCHIVE_URL, ["temperature_2m"], utc_start, utc_end
    )
    act_hourly = act_hourly.rename(columns={"temperature_2m": "temp_c"}).dropna(subset=["temp_c"])

    daily = join_daily(
        _between(hourly_to_daily(fc_hourly, by=["lead_days"]), start, end),
        _between(hourly_to_daily(act_hourly), start, end),
    )

    meta = {
        "location": f"Toronto ({LAT}, {LON})",
        "timezone": TZ,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "forecast_source": f"{PREVIOUS_RUNS_URL} (best_match)",
        "forecast_grid": fc_grid,
        "actual_source": f"{ARCHIVE_URL} (ERA5)",
        "actual_grid": act_grid,
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    out.mkdir(parents=True, exist_ok=True)
    for name, df in [
        ("forecast_hourly", fc_hourly),
        ("actual_hourly", act_hourly),
        ("daily", daily),
    ]:
        df = df.reset_index(drop=True)
        df.attrs = meta  # stored in the Parquet pandas metadata
        df.to_parquet(out / f"{name}.parquet", index=False)
    log.info("wrote %d daily rows (%s..%s) to %s", len(daily), start, end, out)
    return meta | {"daily_rows": len(daily)}


def default_range(today: date | None = None) -> tuple[date, date]:
    """Two years of local days ending ARCHIVE_LAG_DAYS before today."""
    end = (today or date.today()) - timedelta(days=ARCHIVE_LAG_DAYS)
    start = (pd.Timestamp(end) - pd.DateOffset(years=2) + pd.Timedelta(days=1)).date()
    return start, end


def main(argv: list[str] | None = None) -> None:
    d_start, d_end = default_range()
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--start", type=date.fromisoformat, default=d_start)
    p.add_argument("--end", type=date.fromisoformat, default=d_end)
    p.add_argument("--out", type=Path, default=Path(__file__).parent / "data")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    meta = ingest(args.start, args.end, args.out)
    print(f"{meta['daily_rows']} rows, {meta['start']}..{meta['end']}")
    print(f"forecast grid {meta['forecast_grid']}, actual grid {meta['actual_grid']}")


if __name__ == "__main__":
    main()
