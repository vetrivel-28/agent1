"""Tests for strategic theme eligibility — Generic/Complement exclusion."""
import pandas as pd
import pytest

from app.engines import demand_engine
from app.utils.demand_classification import (
    enrich_segment_strategic_metadata,
    is_classification_type_only,
    is_strategic_eligible,
)


def _sample_magnet_with_classification():
    return pd.DataFrame({
        "Keyword Phrase": [
            "table cloth cotton",
            "table runner linen",
            "placemat set",
            "dining chair cover",
            "generic home decor",
            "best table accessory",
        ],
        "Search Volume": [5000, 4200, 3100, 2800, 800, 600],
        "Keyword Sales": [120, 95, 80, 70, 10, 5],
    }), pd.DataFrame({
        "Keyword Phrase": [
            "table cloth cotton",
            "table runner linen",
            "placemat set",
            "dining chair cover",
            "generic home decor",
            "best table accessory",
        ],
        "Classification": [
            "Complement",
            "Complement",
            "Complement",
            "Complement",
            "Generic",
            "Generic",
        ],
    })


def test_complement_not_strategic_without_phrase_derivation():
    seg = {
        "segment": "Complement",
        "keyword_count": 4,
        "total_search_volume": 15100,
        "keywords": [
            {"keyword": "table cloth cotton", "search_volume": 5000},
            {"keyword": "table runner linen", "search_volume": 4200},
            {"keyword": "placemat set", "search_volume": 3100},
        ],
    }
    enriched = enrich_segment_strategic_metadata(seg, 20000)
    assert enriched["theme_type"] in ("Derived", "Classification Type", "Specific")
    if enriched["theme_type"] == "Derived":
        assert enriched["display_segment"] != "Complement"
        assert enriched["strategic_eligible"] is True
    else:
        assert enriched["strategic_eligible"] is False


def test_generic_not_strategic_kpi():
    magnet, kc = _sample_magnet_with_classification()
    result = demand_engine.run(magnet, None, top_n=10, keyword_classification_df=kc)
    assert result["status"] == "success"
    largest = result["results"]["largest_demand_segment"]
    assert largest is not None
    if largest.get("name"):
        assert largest["name"].lower() not in ("generic", "complement")
    opp = result["results"]["demand_opportunity_database"]
    for row in opp:
        if row.get("theme_type") in ("Broad", "Classification Type"):
            assert row["recommendation"] in ("Needs Refinement", "N/A")


def test_is_classification_type_only():
    assert is_classification_type_only("Complement")
    assert is_classification_type_only("Generic")
    assert not is_classification_type_only("Table Cloth")
