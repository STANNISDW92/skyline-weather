import pandas as pd
import pytest

from baseline import mae_by_lead, mae_by_month, report


@pytest.fixture
def daily():
    rows = [
        # date, lead, err_high, err_low
        ("2025-01-10", 1, 1.0, -2.0),
        ("2025-01-11", 1, -3.0, 0.0),
        ("2025-01-10", 2, 2.0, 2.0),
        ("2025-07-04", 1, 0.5, 0.5),
        ("2026-07-04", 1, -1.5, 1.5),
    ]
    df = pd.DataFrame(rows, columns=["date", "lead_days", "err_high", "err_low"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def test_mae_by_lead(daily):
    out = mae_by_lead(daily)
    assert out.loc[1].to_dict() == {
        "n": 4,
        "mae_high": 1.5,
        "mae_low": 1.0,
        "bias_high": -0.75,
        "bias_low": 0.0,
    }
    assert out.loc[2, "mae_high"] == 2.0


def test_mae_by_month_pools_years_and_splits_leads(daily):
    out = mae_by_month(daily)
    assert out.index.tolist() == ["Jan", "Jul"]
    assert out.loc["Jan", ("high", 1)] == 2.0
    assert out.loc["Jan", ("n", 2)] == 1
    assert out.loc["Jul", ("low", 1)] == 1.0
    assert out.loc["Jul", ("n", 1)] == 2  # 2025 and 2026 pooled
    assert pd.isna(out.loc["Jul", ("high", 2)])


def test_report_mentions_range_and_sections(daily):
    text = report(daily)
    assert "2025-01-10 .. 2026-07-04" in text
    assert "By lead time" in text and "MAE by month" in text
