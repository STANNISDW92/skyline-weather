from datetime import date

import pandas as pd
import pytest

import ingest
from ingest import (
    OpenMeteoError,
    date_chunks,
    fetch_json,
    forecast_long,
    hourly_frame,
    hourly_to_daily,
    join_daily,
)

# ---------------------------------------------------------------------------
# helpers


def utc_hours(start: str, end: str) -> pd.DatetimeIndex:
    """Inclusive hourly UTC range."""
    return pd.date_range(start, end, freq="h", tz="UTC")


def local_day_hours(day: str) -> pd.DatetimeIndex:
    """Every hour of a Toronto calendar day, as UTC timestamps."""
    start = pd.Timestamp(day).tz_localize("America/Toronto")
    end = (pd.Timestamp(day) + pd.Timedelta(days=1)).tz_localize("America/Toronto")
    return pd.date_range(start, end, freq="h", inclusive="left").tz_convert("UTC")


def hourly(times, temps, **cols) -> pd.DataFrame:
    return pd.DataFrame({"time_utc": times, "temp_c": temps, **cols})


# ---------------------------------------------------------------------------
# parsing


def test_hourly_frame_parses_utc_and_nulls():
    payload = {
        "utc_offset_seconds": 0,
        "hourly": {
            "time": ["2025-01-01T00:00", "2025-01-01T01:00"],
            "temperature_2m_previous_day1": [1.5, None],
        },
    }
    df = hourly_frame(payload, ["temperature_2m_previous_day1"])
    assert list(df.columns) == ["time_utc", "temperature_2m_previous_day1"]
    assert str(df["time_utc"].dt.tz) == "UTC"
    assert df["time_utc"].iloc[1] == pd.Timestamp("2025-01-01T01:00Z")
    assert df["temperature_2m_previous_day1"].isna().tolist() == [False, True]


def test_hourly_frame_rejects_local_time_responses():
    payload = {"utc_offset_seconds": -18000, "hourly": {"time": [], "temperature_2m": []}}
    with pytest.raises(ValueError, match="UTC"):
        hourly_frame(payload, ["temperature_2m"])


def test_hourly_frame_rejects_missing_variable():
    payload = {"utc_offset_seconds": 0, "hourly": {"time": []}}
    with pytest.raises(ValueError, match="temperature_2m"):
        hourly_frame(payload, ["temperature_2m"])


def test_forecast_long_one_row_per_hour_and_lead_without_nulls():
    wide = pd.DataFrame(
        {
            "time_utc": utc_hours("2025-01-01T00:00", "2025-01-01T01:00"),
            "temperature_2m_previous_day1": [1.0, 2.0],
            "temperature_2m_previous_day2": [3.0, None],
            "temperature_2m_previous_day3": [5.0, 6.0],
        }
    )
    long = forecast_long(wide)
    assert len(long) == 5
    assert sorted(long["lead_days"].unique()) == [1, 2, 3]
    assert (
        long.set_index(["lead_days", "time_utc"]).loc[
            (3, pd.Timestamp("2025-01-01T01:00Z")), "temp_c"
        ]
        == 6.0
    )


# ---------------------------------------------------------------------------
# hourly -> daily


def test_daily_uses_toronto_day_boundaries_not_utc():
    # Jan 15 local (EST, UTC-5) runs 05:00Z Jan 15 .. 04:00Z Jan 16.
    times = local_day_hours("2025-01-15")
    temps = [0.0] * len(times)
    temps[-1] = 9.0  # 03:00Z Jan 16 = 22:00 local Jan 15
    temps[0] = -4.0  # 05:00Z Jan 15 = 00:00 local Jan 15
    daily = hourly_to_daily(hourly(times, temps))
    assert daily.to_dict("records") == [
        {"date": pd.Timestamp("2025-01-15"), "high": 9.0, "low": -4.0}
    ]


def test_utc_hours_before_local_midnight_go_to_previous_day():
    times = list(local_day_hours("2025-01-15"))
    early = pd.Timestamp("2025-01-15T03:00Z")  # 22:00 local Jan 14
    daily = hourly_to_daily(hourly([early, *times], [50.0] + [1.0] * len(times)))
    # Jan 14 has a single hour, so it is incomplete and dropped; Jan 15 is unaffected.
    assert daily["date"].tolist() == [pd.Timestamp("2025-01-15")]
    assert daily["high"].iloc[0] == 1.0


@pytest.mark.parametrize("day,hours", [("2025-03-09", 23), ("2025-11-02", 25), ("2025-07-01", 24)])
def test_dst_days_are_complete_with_23_or_25_hours(day, hours):
    times = local_day_hours(day)
    assert len(times) == hours
    daily = hourly_to_daily(hourly(times, range(hours)))
    assert daily["date"].tolist() == [pd.Timestamp(day)]
    assert (daily["high"].iloc[0], daily["low"].iloc[0]) == (hours - 1, 0)


def test_summer_days_are_shifted_by_edt_not_est():
    # Jul 1 local (EDT, UTC-4) starts at 04:00Z, so 04:00Z belongs to Jul 1 and 03:00Z to Jun 30.
    times = local_day_hours("2025-07-01")
    assert times[0] == pd.Timestamp("2025-07-01T04:00Z")


def test_days_with_a_missing_or_null_hour_are_dropped():
    good = local_day_hours("2025-01-15")
    gap = local_day_hours("2025-01-16")[:-1]
    with_null = local_day_hours("2025-01-17")
    temps = [1.0] * len(good) + [1.0] * len(gap) + [1.0] * (len(with_null) - 1) + [None]
    daily = hourly_to_daily(hourly(good.append(gap).append(with_null), temps))
    assert daily["date"].tolist() == [pd.Timestamp("2025-01-15")]


def test_duplicate_hours_do_not_make_a_short_day_look_complete():
    times = list(local_day_hours("2025-01-15")[:-1])
    daily = hourly_to_daily(hourly(times + times[:1], [1.0] * (len(times) + 1)))
    assert daily.empty


def test_daily_groups_each_lead_separately():
    times = local_day_hours("2025-01-15")
    n = len(times)
    df = pd.concat(
        [
            hourly(times, [10.0] * n, lead_days=1),
            hourly(times, [20.0] * n, lead_days=2),
        ]
    )
    daily = hourly_to_daily(df, by=["lead_days"])
    assert daily[["lead_days", "high"]].values.tolist() == [[1, 10.0], [2, 20.0]]


# ---------------------------------------------------------------------------
# joining forecasts to actuals


def fc_row(day, lead, high, low):
    return {"lead_days": lead, "date": pd.Timestamp(day), "high": high, "low": low}


def obs_row(day, high, low):
    return {"date": pd.Timestamp(day), "high": high, "low": low}


def test_join_pairs_every_lead_with_that_days_observation_and_signs_errors():
    fc = pd.DataFrame([fc_row("2025-01-15", 1, 5.0, -2.0), fc_row("2025-01-15", 2, 3.0, 1.0)])
    obs = pd.DataFrame([obs_row("2025-01-15", 4.0, -1.0)])
    out = join_daily(fc, obs)
    assert out.to_dict("records") == [
        {
            "date": pd.Timestamp("2025-01-15"),
            "lead_days": 1,
            "fc_high": 5.0,
            "fc_low": -2.0,
            "obs_high": 4.0,
            "obs_low": -1.0,
            "err_high": 1.0,
            "err_low": -1.0,
        },
        {
            "date": pd.Timestamp("2025-01-15"),
            "lead_days": 2,
            "fc_high": 3.0,
            "fc_low": 1.0,
            "obs_high": 4.0,
            "obs_low": -1.0,
            "err_high": -1.0,
            "err_low": 2.0,
        },
    ]


def test_join_drops_days_missing_either_side():
    fc = pd.DataFrame([fc_row("2025-01-15", 1, 5.0, 0.0), fc_row("2025-01-16", 1, 5.0, 0.0)])
    obs = pd.DataFrame([obs_row("2025-01-16", 4.0, 0.0), obs_row("2025-01-17", 4.0, 0.0)])
    out = join_daily(fc, obs)
    assert out["date"].tolist() == [pd.Timestamp("2025-01-16")]


def test_join_rejects_duplicate_observations_instead_of_multiplying_rows():
    fc = pd.DataFrame([fc_row("2025-01-15", 1, 5.0, 0.0)])
    obs = pd.DataFrame([obs_row("2025-01-15", 4.0, 0.0), obs_row("2025-01-15", 3.0, 0.0)])
    with pytest.raises(pd.errors.MergeError):
        join_daily(fc, obs)


# ---------------------------------------------------------------------------
# HTTP


class FakeResponse:
    def __init__(self, status=200, payload=None, text=None):
        self.status_code = status
        self._payload = payload
        self.text = text if text is not None else ("" if payload is None else "{...}")

    def json(self):
        if self._payload is None:
            raise ValueError("no JSON")
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class ScriptedSession:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = 0

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        return self.responses.pop(0)


def test_fetch_json_retries_empty_bodies_and_server_errors():
    session = ScriptedSession(
        FakeResponse(200, None), FakeResponse(502, None), FakeResponse(200, {"ok": 1})
    )
    assert fetch_json(session, "u", {}, backoff=0) == {"ok": 1}
    assert session.calls == 3


def test_fetch_json_does_not_retry_api_errors():
    session = ScriptedSession(FakeResponse(400, {"error": True, "reason": "bad variable"}))
    with pytest.raises(OpenMeteoError, match="bad variable"):
        fetch_json(session, "u", {}, backoff=0)
    assert session.calls == 1


def test_fetch_json_gives_up_after_retries():
    session = ScriptedSession(*[FakeResponse(503) for _ in range(3)])
    with pytest.raises(OpenMeteoError, match="3 attempts"):
        fetch_json(session, "u", {}, retries=2, backoff=0)


def test_date_chunks_cover_range_without_gaps_or_overlap():
    chunks = list(date_chunks(date(2025, 1, 1), date(2025, 1, 10), days=4))
    assert chunks == [
        (date(2025, 1, 1), date(2025, 1, 4)),
        (date(2025, 1, 5), date(2025, 1, 8)),
        (date(2025, 1, 9), date(2025, 1, 10)),
    ]


# ---------------------------------------------------------------------------
# end to end with a fake Open-Meteo


class FakeOpenMeteo:
    """Serves hourly UTC data where actual temp = UTC hour and lead N forecast = actual + N."""

    def __init__(self):
        self.requests = []

    def get(self, url, params=None, timeout=None):
        self.requests.append((url, dict(params)))
        times = utc_hours(params["start_date"] + "T00:00", params["end_date"] + "T23:00")
        base = [float(t.hour) for t in times]
        hourly = {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in times]}
        for var in params["hourly"].split(","):
            lead = int(var.rsplit("day", 1)[1]) if "previous_day" in var else 0
            hourly[var] = [b + lead for b in base]
        return FakeResponse(
            200,
            {
                "latitude": 43.65,
                "longitude": -79.38,
                "elevation": 99.0,
                "utc_offset_seconds": 0,
                "hourly": hourly,
            },
        )


def test_ingest_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "CHUNK_DAYS", 5)
    api = FakeOpenMeteo()
    meta = ingest.ingest(date(2025, 3, 5), date(2025, 3, 14), tmp_path, session=api)

    # Requests are UTC, chunked, and padded one day past the end for the UTC-4/-5 offset.
    assert all(p["timezone"] == "GMT" for _, p in api.requests)
    prev = [p for u, p in api.requests if "previous-runs" in u]
    assert [(p["start_date"], p["end_date"]) for p in prev] == [
        ("2025-03-05", "2025-03-09"),
        ("2025-03-10", "2025-03-14"),
        ("2025-03-15", "2025-03-15"),
    ]

    daily = pd.read_parquet(tmp_path / "daily.parquet")
    days = pd.date_range("2025-03-05", "2025-03-14")
    assert daily["date"].drop_duplicates().tolist() == list(days)  # includes DST day Mar 9
    assert len(daily) == len(days) * 3 == meta["daily_rows"]
    # Every local day spans all 24 UTC hours of the clock, so highs are 23, lows 0.
    assert (daily["obs_high"] == 23).all() and (daily["obs_low"] == 0).all()
    assert (daily["err_high"] == daily["lead_days"]).all()
    assert (daily["err_low"] == daily["lead_days"]).all()

    fc = pd.read_parquet(tmp_path / "forecast_hourly.parquet")
    assert set(fc.columns) == {"time_utc", "lead_days", "temp_c"}
    assert pd.read_parquet(tmp_path / "actual_hourly.parquet")["time_utc"].is_unique


def test_default_range_is_two_years_ending_before_archive_lag():
    start, end = ingest.default_range(today=date(2026, 11, 11))
    assert end == date(2026, 11, 4)
    assert start == date(2024, 11, 5)
