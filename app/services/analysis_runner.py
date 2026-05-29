"""
Run all intelligence engines and cache results for single source of truth.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.engines import (
    bsr_efficiency_engine,
    bundle_opportunity_engine,
    complement_engine,
    demand_engine,
    demand_velocity_engine,
    direct_competitor_engine,
    hhi_engine,
    price_elasticity_engine,
    revenue_momentum_engine,
    sales_momentum_engine,
    search_momentum_engine,
    siei_engine,
    substitute_engine,
    whitespace_engine,
)
from app.services.analysis_cache import analysis_cache
from app.services.dataset_registry import registry
from app.services.finance_intelligence import run as run_finance_intelligence
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.logger import get_logger

logger = get_logger("analysis_runner")

DEFAULT_TOP_N = 10


def run_all_engines(top_n: int = DEFAULT_TOP_N) -> Dict[str, Any]:
    """Execute all engines; return engine outputs keyed by module name."""
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    kc_df = registry.get_keyword_classification()

    engines: Dict[str, Any] = {}

    if not is_empty_dataframe(blackbox_df) or not is_empty_dataframe(magnet_df):
        engines["demand"] = demand_engine.run(magnet_df, blackbox_df, top_n=top_n)

    if not is_empty_dataframe(blackbox_df):
        engines["sales_momentum"] = sales_momentum_engine.run(blackbox_df, top_n=top_n)
        engines["revenue_momentum"] = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
        engines["bsr_efficiency"] = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)
        engines["hhi"] = hhi_engine.run(blackbox_df, top_n=top_n)
        engines["price_elasticity"] = price_elasticity_engine.run(None, blackbox_df)
        engines["direct_competitors"] = direct_competitor_engine.run(None, blackbox_df, top_n=top_n)

    if not is_empty_dataframe(magnet_df):
        engines["siei"] = siei_engine.run(magnet_df, top_n=top_n)
        engines["whitespace"] = whitespace_engine.run(magnet_df, None, top_n=top_n)
        engines["demand_velocity"] = demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n)

    if not (is_empty_dataframe(magnet_df) or is_empty_dataframe(blackbox_df)):
        engines["search_momentum"] = search_momentum_engine.run(magnet_df, blackbox_df, top_n=top_n)

    if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)):
        engines["substitute"] = substitute_engine.run(kc_df, blackbox_df, top_n=top_n)
        engines["complement"] = complement_engine.run(kc_df, blackbox_df, top_n=top_n)
        engines["bundle"] = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n)

    demand_score = (
        engines.get("demand", {}).get("results", {}).get("market_demand_index")
        or engines.get("demand", {}).get("results", {}).get("overall_demand_score")
    )
    engines["finance"] = run_finance_intelligence(magnet_df, blackbox_df, demand_score=demand_score)

    snapshot = {
        "top_n": top_n,
        "engines": engines,
    }
    analysis_cache.set_snapshot(snapshot)
    logger.info("Full analysis run complete: %s engines", len(engines))
    return snapshot


def get_cached_engine(name: str) -> Optional[Dict[str, Any]]:
    return analysis_cache.get_engine(name)
