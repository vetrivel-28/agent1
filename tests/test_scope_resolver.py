import pandas as pd

from app.services.dataset_registry import DatasetRegistry
from app.utils.scope_resolver import enrich_scope_dict, filter_kc_to_magnet, compute_cache_key, build_data_scope


def test_enrich_scope_dict_all_categories():
    scope = enrich_scope_dict({"mode": "all", "selected_categories": []})
    assert scope["scope_key"] == "all"
    assert scope["keyword_scope_key"] == "all"


def test_enrich_scope_dict_selected():
    scope = enrich_scope_dict({
        "mode": "selected",
        "selected_categories": ["Sports & Outdoors"],
        "category_column": "Category",
    })
    assert scope["scope_key"] == "Sports & Outdoors"
    assert scope["keyword_scope_key"] == "Sports & Outdoors_kw"


def test_filter_kc_to_magnet():
    magnet = pd.DataFrame({
        "Keyword Phrase": ["pool table cloth", "kitchen tablecloth"],
        "Search Volume": [100, 200],
    })
    kc = pd.DataFrame({
        "Keyword Phrase": ["pool table cloth", "kitchen tablecloth", "unrelated"],
        "Classification": ["Generic", "Generic", "Generic"],
    })
    filtered = filter_kc_to_magnet(kc, magnet)
    assert len(filtered) == 2


def test_scoped_magnet_remains_full_universe_when_category_selected():
    """Keywords must not be filtered by selected product category."""
    registry = DatasetRegistry()
    blackbox = pd.DataFrame({
        "Category": ["Sports & Outdoors", "Kitchen & Dining"],
        "Title": [
            "Billiard Pool Table Cloth Felt",
            "Floral Kitchen Tablecloth Rectangle",
        ],
        "ASIN": ["A1", "A2"],
    })
    magnet = pd.DataFrame({
        "Keyword Phrase": [
            "pool table cloth",
            "billiard felt",
            "kitchen tablecloth",
            "dining room decor",
        ],
        "Search Volume": [500, 400, 900, 100],
    })
    registry.set_blackbox(blackbox)
    registry.set_magnet(magnet)
    registry.set_category(["Sports & Outdoors"])

    scope = enrich_scope_dict(registry.get_category_scope())
    scoped_bb, bb_meta = registry.get_scoped_blackbox_df(scope)
    scoped_magnet, kw_meta = registry.get_scoped_magnet_df(scope, scoped_bb)

    assert len(scoped_bb) == 1
    assert bb_meta["active_rows"] == 1
    assert len(scoped_magnet) == len(magnet)
    assert kw_meta["mode"] == "keyword_wide"
    assert kw_meta["matchedKeywordCount"] == kw_meta["totalKeywordCount"] == 4
    keywords = set(scoped_magnet["Keyword Phrase"].astype(str).str.lower())
    assert "kitchen tablecloth" in keywords


def test_build_data_scope_labels():
    scope_meta = {
        "mode": "selected",
        "selected_categories": ["Sports & Outdoors"],
        "active_rows": 120,
        "total_rows": 500,
    }
    kw_meta = {"totalKeywordCount": 11243, "mode": "keyword_wide"}
    ds = build_data_scope(scope_meta, kw_meta)
    assert "11,243" in ds["keyword_intelligence"]["description"]
    assert "120" in ds["product_intelligence"]["description"]
    assert "No category" in ds["keyword_intelligence"]["filtering"]


def test_page_scope_registry_demand_is_keyword_global():
    from app.utils.page_scope_registry import get_page_scope
    spec = get_page_scope("demand_strength")
    assert spec["keyword_scope"] == "global"
    assert spec["category_dependency"] is False
