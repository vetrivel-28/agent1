"""Validation checks for demand_engine — dataset-derived outputs only."""
import pandas as pd
import pytest

from app.engines import demand_engine
from app.utils.demand_classification import is_generic_theme


def _sample_magnet():
    return pd.DataFrame({
        "Keyword Phrase": [
            "bath towel set",
            "beach towel large",
            "hand towel cotton",
            "kitchen towel absorbent",
            "microfiber towel quick dry",
            "oversized bath sheet",
            "generic towel",
            "best towel",
        ],
        "Search Volume": [5000, 4200, 3100, 2800, 2400, 1900, 800, 600],
        "Keyword Sales": [120, 95, 80, 70, 55, 40, 10, 5],
    })


def test_no_hardcoded_towel_theme_as_only_name():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    assert result["status"] == "success"
    segments = [s["segment"] for s in result["results"]["demand_opportunity_database"]]
    for seg in segments:
        if seg == "Other":
            continue
        assert seg.lower() != "towel", f"Generic single-word theme rejected: {seg}"


def test_classified_plus_unclassified_pct_sums_to_100():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    diag = result["results"]["classification_diagnostics"]
    total = diag["classified_demand_pct"] + diag["unclassified_demand_pct"]
    assert abs(total - 100) < 0.5


def test_volume_sum_valid():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    diag = result["results"]["classification_diagnostics"]
    assert diag["volume_sum_valid"] is True
    assert (
        diag["classified_search_volume"] + diag["unclassified_search_volume"]
        == diag["total_search_volume"]
    )


def test_opportunity_row_confidence_calculated():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    for row in result["results"]["demand_opportunity_database"]:
        if row["segment"] == "Other":
            continue
        assert "row_confidence" in row
        assert 0 <= row["row_confidence"] <= 100


def test_reliable_opportunity_score():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    for row in result["results"]["demand_opportunity_database"]:
        if row["segment"] == "Other":
            continue
        expected = round(row["opportunity_score"] * (row["row_confidence"] / 100), 1)
        assert row["reliable_opportunity_score"] == expected


def test_undervalued_empty_state_or_named():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    uv = result["results"]["most_undervalued_theme"]
    assert uv is not None
    if uv.get("empty_state"):
        assert uv.get("title") == "No undervalued theme detected"
        assert uv.get("name") is None
    else:
        assert uv.get("name")
        assert uv.get("gap", 0) > 2


def test_best_entry_has_balanced_score():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    entry = result["results"].get("recommended_entry")
    if entry:
        assert "score" in entry
        assert entry["evidence"]["formula"].find("0.35") >= 0


def test_generic_theme_rejected():
    assert is_generic_theme("towel")
    assert is_generic_theme("best")
    assert not is_generic_theme("kitchen towel")


def test_dataset_session_id_present():
    result = demand_engine.run(_sample_magnet(), None, top_n=10)
    assert "dataset_session_id" in result
    assert result["results"]["classification_diagnostics"].get("dataset_session_id")
