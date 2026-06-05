import pandas as pd

from app.services.dataset_registry import DatasetRegistry
from app.utils.scope_resolver import enrich_scope_dict, filter_kc_to_magnet, compute_cache_key


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


def test_scoped_magnet_filters_by_product_titles():
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
    scoped_bb, _ = registry.get_scoped_blackbox_df(scope)
    scoped_magnet, kw_meta = registry.get_scoped_magnet_df(scope, scoped_bb)

    keywords = set(scoped_magnet["Keyword Phrase"].astype(str).str.lower())
    assert "pool table cloth" in keywords or "billiard felt" in keywords
    assert kw_meta["mode"] == "category_mapped"
    assert kw_meta["matchedKeywordCount"] < kw_meta["totalKeywordCount"]
    assert "kitchen tablecloth" not in keywords
