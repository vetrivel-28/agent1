"""
Run all intelligence engines and cache results for single source of truth.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
import concurrent.futures

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

    futures = {}
    with concurrent.futures.ThreadPoolExecutor() as executor:
        if not is_empty_dataframe(blackbox_df) or not is_empty_dataframe(magnet_df):
            futures["demand"] = executor.submit(demand_engine.run, magnet_df, blackbox_df, top_n)

        if not is_empty_dataframe(blackbox_df):
            futures["sales_momentum"] = executor.submit(sales_momentum_engine.run, blackbox_df, top_n)
            futures["revenue_momentum"] = executor.submit(revenue_momentum_engine.run, blackbox_df, top_n)
            futures["bsr_efficiency"] = executor.submit(bsr_efficiency_engine.run, blackbox_df, top_n)
            futures["hhi"] = executor.submit(hhi_engine.run, blackbox_df, top_n)
            futures["price_elasticity"] = executor.submit(price_elasticity_engine.run, None, blackbox_df)
            futures["direct_competitors"] = executor.submit(direct_competitor_engine.run, None, blackbox_df, top_n)

        if not is_empty_dataframe(magnet_df):
            futures["siei"] = executor.submit(siei_engine.run, magnet_df, top_n)
            futures["whitespace"] = executor.submit(whitespace_engine.run, magnet_df, None, top_n)
            futures["demand_velocity"] = executor.submit(demand_velocity_engine.run, magnet_df, blackbox_df, top_n)

        if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)):
            futures["substitute"] = executor.submit(substitute_engine.run, kc_df, blackbox_df, top_n)
            futures["complement"] = executor.submit(complement_engine.run, kc_df, blackbox_df, top_n)
            futures["bundle"] = executor.submit(bundle_opportunity_engine.run, kc_df, blackbox_df, top_n)
            
        for name, future in futures.items():
            try:
                engines[name] = future.result()
            except Exception as exc:
                logger.exception(f"{name} engine failed")
                engines[name] = {
                    "status": "error",
                    "message": f"{name} engine failed: {str(exc)}",
                    "results": {},
                    "processing_time_seconds": 0.0,
                }

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
