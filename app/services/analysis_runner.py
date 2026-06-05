"""
Run all intelligence engines and cache results for single source of truth.

Engines run in parallel via ThreadPoolExecutor. Results are cached
incrementally as each engine completes, so the frontend can start
displaying data before the full run finishes.
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
from app.utils.scope_resolver import resolve_analysis_datasets, scope_from_registry

logger = get_logger("analysis_runner")

DEFAULT_TOP_N = 10


def run_all_engines(top_n: int = DEFAULT_TOP_N) -> Dict[str, Any]:
    """Execute all engines; cache results incrementally as they complete."""
    ready, msg = registry.analysis_readiness()
    if not ready:
        logger.error("Analysis blocked: %s", msg)
        return {
            "top_n": top_n,
            "engines": {},
            "status": "error",
            "message": msg,
        }

    scope_dict = scope_from_registry(registry.get_category_scope())
    blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key = resolve_analysis_datasets(
        registry, scope_dict,
    )
    logger.info(
        "Analysis scope: category=%s, magnet_keywords=%s/%s, cache_key=%s",
        scope_meta.get("mode"),
        kw_meta.get("matchedKeywordCount"),
        kw_meta.get("totalKeywordCount"),
        cache_key,
    )

    engines: Dict[str, Any] = {}

    # Build the list of futures to determine total count
    futures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        if not is_empty_dataframe(blackbox_df) or not is_empty_dataframe(magnet_df):
            futures["demand"] = executor.submit(
                demand_engine.run, magnet_df, blackbox_df, top_n, kc_df,
            )

        if not is_empty_dataframe(blackbox_df):
            futures["sales_momentum"] = executor.submit(sales_momentum_engine.run, blackbox_df, top_n)
            futures["revenue_momentum"] = executor.submit(revenue_momentum_engine.run, blackbox_df, top_n)
            futures["bsr_efficiency"] = executor.submit(bsr_efficiency_engine.run, blackbox_df, top_n)
            futures["hhi"] = executor.submit(hhi_engine.run, blackbox_df, top_n)
            futures["price_elasticity"] = executor.submit(price_elasticity_engine.run, None, blackbox_df)
            futures["direct_competitors"] = executor.submit(direct_competitor_engine.run, None, blackbox_df, top_n)

        if not is_empty_dataframe(magnet_df):
            futures["siei"] = executor.submit(siei_engine.run, magnet_df, kc_df, top_n)
            futures["whitespace"] = executor.submit(whitespace_engine.run, magnet_df, None, top_n)
            futures["demand_velocity"] = executor.submit(demand_velocity_engine.run, magnet_df, blackbox_df, top_n)

        if not (is_empty_dataframe(kc_df) or is_empty_dataframe(blackbox_df)):
            futures["substitute"] = executor.submit(substitute_engine.run, kc_df, blackbox_df, top_n)
            futures["complement"] = executor.submit(complement_engine.run, kc_df, blackbox_df, top_n)
            futures["bundle"] = executor.submit(bundle_opportunity_engine.run, kc_df, blackbox_df, top_n)

        # Signal processing start with total engine count
        # +1 for finance which runs after demand completes
        analysis_cache.set_processing(len(futures) + 1)

        # Process results as they complete (incremental caching)
        for future in concurrent.futures.as_completed(futures.values()):
            # Find the name for this future
            name = next(n for n, f in futures.items() if f is future)
            try:
                result = future.result()
                engines[name] = result
                # Cache immediately so frontend can access it
                analysis_cache.set_engine(name, result, cache_key)
                logger.info(f"Engine '{name}' completed and cached")
            except Exception as exc:
                logger.exception(f"{name} engine failed")
                error_result = {
                    "status": "error",
                    "message": f"{name} engine failed: {str(exc)}",
                    "results": {},
                    "processing_time_seconds": 0.0,
                }
                engines[name] = error_result
                analysis_cache.set_engine(name, error_result, cache_key)

    # Finance depends on demand score — runs after parallel batch
    demand_score = (
        engines.get("demand", {}).get("results", {}).get("market_demand_index")
        or engines.get("demand", {}).get("results", {}).get("overall_demand_score")
    )
    engines["finance"] = run_finance_intelligence(magnet_df, blackbox_df, demand_score=demand_score)
    analysis_cache.set_engine("finance", engines["finance"], cache_key)

    snapshot = {
        "top_n": top_n,
        "engines": engines,
    }
    analysis_cache.set_snapshot(snapshot)
    logger.info("Full analysis run complete: %s engines", len(engines))
    return snapshot
