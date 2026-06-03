"""
FastAPI routes — Market Intelligence Agent Phase 1.

All analysis endpoints pass the full engine result dict directly to the
response model.  The engines own the result structure; routes are thin
wrappers that:
  1. Check datasets are loaded
  2. Call the engine
  3. Return the engine dict (which already matches the response schema)
"""
from __future__ import annotations

from typing import Optional, Any
from pydantic import BaseModel
import math
from fastapi import BackgroundTasks

class StandardResponse(BaseModel):
    success: bool
    message: str
    data: Any

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

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
from app.models.response_models import (
    BSREfficiencyResult,
    BundleOpportunityResult,
    ComplementIntelligenceResult,
    DemandStrengthResult,
    DemandVelocityResult,
    DirectCompetitorsResult,
    HHIResult,
    HealthCheck,
    MarketReportResult,
    PriceElasticityResult,
    RevenueMomentumResult,
    SalesMomentumResult,
    SIEIResult,
    SubstituteIntelligenceResult,
    UploadResponse,
    WhitespaceOpportunityResult,
    FinanceIntelligenceResult,
)
from app.services.analysis_cache import analysis_cache
from app.services.analysis_runner import run_all_engines
from app.services.dataset_registry import registry
from app.services.finance_intelligence import run as run_finance_intelligence
from app.services.pdf_exporter import export_market_report_pdf
from app.services.report_builder import (
    build_report,
    _build_demand_hotspot,
    _build_primary_price_cluster,
    _find_column,
    _to_numeric_series,
    _normalize_text,
)
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.logger import get_logger
from app.validators.dataset_validator import validate_csv_bytes


def sanitize_payload(obj):
    import numpy as np
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_payload(x) for x in obj]
    return obj

def format_response(result: dict) -> dict:
    status = result.get('status', 'success')
    success = status != 'error'
    message = result.get('message') or result.get('summary') or 'Success'
    return {
        'success': success,
        'message': message,
        'data': sanitize_payload(result)
    }

logger = get_logger("routes")
router = APIRouter(prefix="/api/v1", tags=["Market Intelligence"])


# =========================================================================
# Health / Status
# =========================================================================

@router.get(
    "/health",
    response_model=StandardResponse,
    summary="Health check",
    description="Returns API health status and which datasets are currently loaded.",
)
def health_check():
    logger.info("Health check requested")
    return format_response({
        "status": "ok",
        "message": "Market Intelligence Agent is running",
        "datasets_loaded": registry.get_status(),
    })


@router.get(
    "/status",
    summary="Dataset status",
    description="Returns detailed metadata about every loaded dataset.",
)
def get_status():
    logger.info("Status check requested")
    return format_response({
        "status": "ok",
        "datasets": registry.get_status(),
        "metadata": registry.get_meta(),
        "rows_loaded": registry.rows_loaded(),
    })


# =========================================================================
# Dataset Upload
# =========================================================================

@router.post(
    "/upload-datasets",
    response_model=StandardResponse,
    summary="Upload CSV datasets",
    description=(
        "Upload up to three CSV files:\n"
        "- **blackbox**: BlackBox Products dataset\n"
        "- **magnet**: Magnet Keyword dataset\n"
        "- **keyword_classification**: Keyword Classification dataset\n\n"
        "All files are optional per request.  "
        "Previously uploaded datasets remain in memory until replaced."
    ),
)
async def upload_datasets(
    background_tasks: BackgroundTasks,
    blackbox: Optional[UploadFile] = File(None, description="BlackBox Products CSV"),
    magnet: Optional[UploadFile] = File(None, description="Magnet Keyword CSV"),
    keyword_classification: Optional[UploadFile] = File(
        None, description="Keyword Classification CSV"
    ),
):
    logger.info("Dataset upload started")

    errors = []
    rows_loaded: dict = {}
    datasets_loaded = {
        "blackbox": False,
        "magnet": False,
        "keyword_classification": False,
    }

    # ---- BlackBox ----
    if blackbox:
        try:
            content = await blackbox.read()
            ok, df, err = validate_csv_bytes(content, "blackbox", expected_type="blackbox")
            if ok:
                registry.set_blackbox(df)
                analysis_cache.clear()
                rows_loaded["blackbox"] = len(df)
                datasets_loaded["blackbox"] = True
                logger.info(f"BlackBox uploaded: {len(df)} rows, {len(df.columns)} cols")
            else:
                errors.append(err)
                logger.warning(f"BlackBox validation failed: {err.get('message')}")
        except Exception as exc:
            errors.append({"status": "error", "dataset": "blackbox", "message": str(exc)})
            logger.error(f"BlackBox upload exception: {exc}")

    # ---- Magnet ----
    if magnet:
        try:
            content = await magnet.read()
            ok, df, err = validate_csv_bytes(content, "magnet", expected_type="magnet")
            if ok:
                registry.set_magnet(df)
                analysis_cache.clear()
                rows_loaded["magnet"] = len(df)
                datasets_loaded["magnet"] = True
                logger.info(f"Magnet uploaded: {len(df)} rows, {len(df.columns)} cols")
            else:
                errors.append(err)
                logger.warning(f"Magnet validation failed: {err.get('message')}")
        except Exception as exc:
            errors.append({"status": "error", "dataset": "magnet", "message": str(exc)})
            logger.error(f"Magnet upload exception: {exc}")

    # ---- Keyword Classification ----
    if keyword_classification:
        try:
            content = await keyword_classification.read()
            ok, df, err = validate_csv_bytes(content, "keyword_classification", expected_type="keyword_classification")
            if ok:
                registry.set_keyword_classification(df)
                analysis_cache.clear()
                rows_loaded["keyword_classification"] = len(df)
                datasets_loaded["keyword_classification"] = True
                logger.info(
                    f"Keyword Classification uploaded: {len(df)} rows, {len(df.columns)} cols"
                )
            else:
                errors.append(err)
                logger.warning(
                    f"Keyword Classification validation failed: {err.get('message')}"
                )
        except Exception as exc:
            errors.append(
                {
                    "status": "error",
                    "dataset": "keyword_classification",
                    "message": str(exc),
                }
            )
            logger.error(f"Keyword Classification upload exception: {exc}")

    # ---- Overall status ----
    any_loaded = any(datasets_loaded.values())
    if errors and not any_loaded:
        overall = "error"
        first_err = errors[0].get("message", "validation failed")
        message = first_err if first_err else "All datasets failed validation."
    elif errors:
        overall = "partial"
        first_err = errors[0].get("message", "validation failed")
        message = f"Some datasets uploaded successfully. Failed: {first_err}"
    elif not any_loaded:
        overall = "warning"
        message = "No files were provided. Send at least one CSV file."
    else:
        overall = "success"
        message = "All provided datasets uploaded and validated successfully."

    if any_loaded:
        background_tasks.add_task(run_all_engines)
    return format_response({
        "status": overall,
        "message": message,
        "datasets_loaded": datasets_loaded,
        "rows_loaded": rows_loaded,
        "errors": errors if errors else None,
    })


# =========================================================================
# Analysis Engines
# =========================================================================

@router.post(
    "/demand-strength",
    response_model=StandardResponse,
    summary="Demand Strength",
    description=(
        "Measures overall market demand health.\n\n"
        "**Datasets**: Magnet Keyword + BlackBox Products\n\n"
        "**Formula**: `Demand Strength = mean(norm_search_volume, norm_keyword_sales, "
        "norm_asin_sales, norm_revenue)` — each metric min-max normalised to 0-100.\n\n"
        "**Returns**: 0-100 score, top keywords by search volume, top products by sales."
    ),
)
def demand_strength(top_n: int = 10):
    logger.info(f"Demand Strength requested (top_n={top_n})")

    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    kc_df = registry.get_keyword_classification()

    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Strength", "magnet and/or blackbox")

    cached = analysis_cache.get_engine("demand")
    if cached:
        return format_response(cached)
    result = demand_engine.run(magnet_df, blackbox_df, top_n=top_n, keyword_classification_df=kc_df)
    logger.info(
        f"Demand Strength complete — status={result['status']}, "
        f"score={result.get('results', {}).get('overall_demand_score', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/sales-momentum",
    response_model=StandardResponse,
    summary="Sales Momentum",
    description=(
        "Measures brand-level sales acceleration.\n\n"
        "**Dataset**: BlackBox Products (grouped by Brand)\n\n"
        "**Formula**: `Sales Momentum = mean(norm_sales_trend, norm_asin_sales)` "
        "aggregated at brand level, normalised to 0-100.\n\n"
        "**Returns**: fastest-growing brands, declining brands, market direction."
    ),
)
def sales_momentum(top_n: int = 10):
    logger.info(f"Sales Momentum requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Sales Momentum", "blackbox")

    cached = analysis_cache.get_engine("sales_momentum")
    if cached:
        return format_response(cached)
    result = sales_momentum_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"Sales Momentum complete — status={result['status']}, "
        f"brands={result.get('results', {}).get('total_brands_analysed', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/revenue-momentum",
    response_model=StandardResponse,
    summary="Revenue Momentum",
    description=(
        "Measures brand growth velocity and traction in the market.\n\n"
        "**Dataset**: BlackBox Products (grouped by Brand)\n\n"
        "**Formula**: `Revenue Momentum = 0.40×SalesVelocity + 0.30×ReviewVelocity + "
        "0.20×BSRMomentum + 0.10×RevenueStrength`, normalized to 0-100.\n\n"
        "**Returns**: momentum leaders, momentum laggards, component scores, market momentum direction."
    ),
)
def revenue_momentum(top_n: int = 10):
    logger.info(f"Revenue Momentum requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Revenue Momentum", "blackbox")

    cached = analysis_cache.get_engine("revenue_momentum")
    if cached:
        return format_response(cached)
    result = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"Revenue Momentum complete — status={result['status']}, "
        f"brands={result.get('results', {}).get('total_brands_analysed', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/bsr-efficiency",
    response_model=StandardResponse,
    summary="BSR Efficiency",
    description=(
        "Measures revenue efficiency relative to BSR rank.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Formula**:\n"
        "1. `Norm BSR = (1 - BSR / max_BSR) × 100`  (lower BSR = better rank = higher score)\n"
        "2. `Norm Revenue = min-max normalised to 0-100`\n"
        "3. `Efficiency = (Norm Revenue × 0.6) + (Norm BSR × 0.4)`\n\n"
        "**Returns**: efficient products (top quartile), inefficient products (bottom quartile), "
        "market efficiency score."
    ),
)
def bsr_efficiency(top_n: int = 10):
    logger.info(f"BSR Efficiency requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("BSR Efficiency", "blackbox")

    cached = analysis_cache.get_engine("bsr_efficiency")
    if cached:
        return format_response(cached)
    result = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)
    logger.info(
        f"BSR Efficiency complete — status={result['status']}, "
        f"products={result.get('results', {}).get('total_products_analysed', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/demand-velocity",
    response_model=StandardResponse,
    summary="Demand Velocity",
    description=(
        "Measures how fast market demand is accelerating.\n\n"
        "**Datasets**: Magnet Keyword + BlackBox Products\n\n"
        "**Formula**: `Demand Velocity = (Normalized Sales Trend + Normalized Search Trend + "
        "Normalized YoY Growth + Normalized Revenue Trend) / 4` with min-max normalization.\n\n"
        "**Returns**: velocity score, market phase, strongest/weakest growth signals, validation stats."
    ),
)
def demand_velocity(top_n: int = 10):
    logger.info(f"Demand Velocity requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Velocity", "magnet and/or blackbox")
    cached = analysis_cache.get_engine("demand_velocity")
    if cached:
        return format_response(cached)
    return format_response(demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n))


@router.post(
    "/search-intent-efficiency",
    response_model=StandardResponse,
    summary="Search Intent Efficiency Index (SIEI)",
    description=(
        "Finds keywords receiving clicks but under-converting.\n\n"
        "**Dataset**: Magnet Keyword\n\n"
        "**Formula**: `SIEI = ABA Total Conv. Share / ABA Total Click Share` "
        "with safe division and percentile-based ranking.\n\n"
        "**Returns**: highest/lowest efficiency keywords, market friction keywords, click-heavy low-conversion keywords."
    ),
)
def search_intent_efficiency(top_n: int = 10):
    logger.info(f"SIEI requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    kc_df = registry.get_keyword_classification()
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Search Intent Efficiency Index (SIEI)", "magnet")
    cached = analysis_cache.get_engine("siei")
    if cached:
        return format_response(cached)
    return format_response(siei_engine.run(magnet_df, keyword_classification_df=kc_df, top_n=top_n))


@router.post(
    "/market-concentration",
    response_model=StandardResponse,
    summary="Market Concentration Index (HHI)",
    description=(
        "Measures monopoly vs fragmentation using Herfindahl-Hirschman Index.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Formula**:\n"
        "1. `Total Revenue = SUM(Revenue)`\n"
        "2. `Brand Market Share = Brand Revenue / Total Revenue`\n"
        "3. `HHI = SUM((market_share * 100)^2)`\n\n"
        "**Returns**: HHI score, structure type, top brands by share, concentration distribution."
    ),
)
def market_concentration(top_n: int = 10):
    logger.info(f"Market Concentration requested (top_n={top_n})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Concentration Index (HHI)", "blackbox")
    cached = analysis_cache.get_engine("hhi")
    if cached:
        return format_response(cached)
    return format_response(hhi_engine.run(blackbox_df, top_n=top_n))


# =========================================================================
# Phase 2: New Intelligence Engines
# =========================================================================

@router.post(
    "/whitespace-opportunities",
    response_model=StandardResponse,
    summary="Whitespace Opportunity Analysis",
    description=(
        "Find high-demand keywords with weak competitor optimization.\n\n"
        "**Dataset**: Magnet Keyword\n\n"
        "**Formula**: `Whitespace Score = Norm(Search Volume) × (1 - Norm(Title Density))` "
        "with log scaling and percentile clipping, then normalized to 0-100.\n\n"
        "**Returns**: overall whitespace score, top SEO opportunities by keyword, "
        "opportunity distribution, market insights."
    ),
)
def whitespace_opportunities(top_n: int = 15):
    logger.info(f"Whitespace Opportunity requested (top_n={top_n})")
    magnet_df = registry.get_magnet()
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Whitespace Opportunity", "magnet")
    cached = analysis_cache.get_engine("whitespace")
    if cached:
        return format_response(cached)
    result = whitespace_engine.run(magnet_df, None, top_n=top_n)
    logger.info(
        f"Whitespace Opportunity complete — status={result['status']}, "
        f"score={result.get('results', {}).get('overall_whitespace_score', 'n/a')}"
    )
    return format_response(result)


@router.get(
    "/revenue-opportunity/segments/{segment_name}/keywords",
    summary="Revenue Opportunity Segment Keywords",
    description=(
        "Returns unique normalized keywords assigned to a revenue opportunity segment. "
        "Duplicates are removed and the same segment classification logic as the chart is used."
    ),
)
def revenue_opportunity_segment_keywords(segment_name: str):
    logger.info(f"Revenue Opportunity keywords requested for segment={segment_name}")

    # ── Primary path: read from the cached whitespace run (exact same segments) ──
    cached_ws = analysis_cache.get_engine("whitespace")
    if cached_ws and cached_ws.get("status") == "success":
        entry_segments = cached_ws.get("results", {}).get("entry_segments", [])
        # Exact match first, then case-insensitive fallback
        matched = next(
            (s for s in entry_segments if s.get("segment") == segment_name), None
        )
        if matched is None:
            matched = next(
                (s for s in entry_segments
                 if str(s.get("segment", "")).strip().lower() == segment_name.strip().lower()),
                None,
            )
        if matched is not None:
            kw_list = matched.get("keywords", [])
            raw_count = matched.get("raw_rows_before_dedupe", len(kw_list))
            dupe_count = matched.get("duplicate_rows_removed", 0)
            return {
                "success": True,
                "segment": segment_name,
                "opportunity_revenue": matched.get("opportunity_revenue", 0.0),
                "opportunity_keywords": matched.get("opportunity_keywords", len(kw_list)),
                "keyword_count": len(kw_list),
                "avg_opportunity_score": matched.get("avg_opportunity_score"),
                "raw_rows_before_dedupe": raw_count,
                "unique_keywords_after_dedupe": len(kw_list),
                "duplicate_rows_removed": dupe_count,
                "raw_row_count": raw_count,
                "duplicate_removed_count": dupe_count,
                "recommended_priority": matched.get("recommended_priority", "Evaluate"),
                "competitive_intensity": matched.get("competitive_intensity", "—"),
                "primary_driver": matched.get("primary_driver", "—"),
                "keywords": kw_list,
            }
        # Segment not found in cache — return not-found with segment list for debugging
        available = [s.get("segment") for s in entry_segments]
        logger.warning(
            f"Segment '{segment_name}' not found in cached whitespace. "
            f"Available: {available}"
        )
        return {
            "success": False,
            "segment": segment_name,
            "keyword_count": 0,
            "raw_row_count": 0,
            "duplicate_removed_count": 0,
            "keywords": [],
            "message": (
                f"Segment '{segment_name}' not found in whitespace analysis. "
                f"Available segments: {', '.join(str(a) for a in available[:10])}."
            ),
        }

    # ── Fallback: re-run with kc_df so segment names are consistent ──────────
    magnet_df = registry.get_magnet()
    if is_empty_dataframe(magnet_df):
        return {
            "success": False,
            "segment": segment_name,
            "raw_row_count": 0,
            "duplicate_removed_count": 0,
            "keyword_count": 0,
            "keywords": [],
            "message": "Magnet keyword dataset not uploaded or is empty.",
        }
    return whitespace_engine.get_revenue_segment_keywords(magnet_df, segment_name)


@router.post(
    "/direct-competitors",
    response_model=StandardResponse,
    summary="Direct Competitor Analysis",
    description=(
        "Identify direct market competitors by category, subcategory, and price.\n\n"
        "**Dataset**: BlackBox Products\n\n"
        "**Logic**: Direct competitors share same category, subcategory, and similar pricing "
        "(±15–20% dynamic range).\n\n"
        "**Formula**: `Similarity Score = 40×(category_match) + 35×(subcategory_match) + 25×(price_similarity)` "
        "normalized to 0-100.\n\n"
        "**Returns**: competitor clusters, price positioning, competition density, similarity rankings."
    ),
)
def direct_competitors(top_n: int = 15, price_tolerance_pct: float = 17.5):
    logger.info(f"Direct Competitors requested (top_n={top_n})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Direct Competitors", "blackbox")
    cached = analysis_cache.get_engine("direct_competitors")
    if cached:
        return format_response(cached)
    result = direct_competitor_engine.run(
        None, blackbox_df, top_n=top_n, price_tolerance_pct=price_tolerance_pct
    )
    logger.info(
        f"Direct Competitors complete — status={result['status']}, "
        f"clusters={result.get('results', {}).get('total_clusters', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/price-elasticity",
    response_model=StandardResponse,
    summary="Price Intelligence (Pricing Strategy)",
    description=(
        "Pricing strategy analysis: revenue by price band, market structure, "
        "attractiveness scores, and entry recommendations.\n\n"
        "**Dataset**: BlackBox Products (Price + ASIN Revenue or ASIN Sales required)\n\n"
        "**Returns**: KPIs, price bands, insights, opportunity table, positioning."
    ),
)
def price_elasticity(n_buckets: int = 5):
    logger.info(f"Price Elasticity requested (n_buckets={n_buckets})")
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Price Elasticity", "blackbox")
    cached = analysis_cache.get_engine("price_elasticity")
    if cached:
        return format_response(cached)
    result = price_elasticity_engine.run(None, blackbox_df, n_buckets=n_buckets)
    logger.info(
        f"Price Elasticity complete — status={result['status']}, "
        f"buckets={result.get('results', {}).get('bucket_count', 'n/a')}"
    )
    return format_response(result)

# =========================================================================
# Ecosystem Intelligence Engines
# =========================================================================

@router.post(
    "/substitute-intelligence",
    response_model=StandardResponse,
    summary="Substitute Intelligence",
    description=(
        "Identifies substitute products stealing demand from the target market.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Extract keywords classified as 'Substitute'\n"
        "2. Score every BlackBox product using fuzzy + token-overlap similarity\n"
        "3. Cluster substitute products by subcategory\n\n"
        "**Formula**: `Similarity = 0.4 × bigram_overlap + 0.6 × token_jaccard`. "
        "`Market Overlap Score = min(density × mean_similarity × 3, 100)`.\n\n"
        "**Returns**: substitute keywords, matched products, subcategory clusters, "
        "market overlap score 0-100."
    ),
)
def substitute_intelligence(top_n: int = 10):
    logger.info(f"Substitute Intelligence requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Substitute Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Substitute Intelligence", "blackbox")
    cached = analysis_cache.get_engine("substitute")
    if cached:
        return format_response(cached)
    result = substitute_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Substitute Intelligence complete — status={result['status']}, "
        f"substitutes={result.get('results', {}).get('total_substitute_products', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/complement-intelligence",
    response_model=StandardResponse,
    summary="Complement Intelligence",
    description=(
        "Identifies complementary ecosystem products and cross-sell opportunities.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Extract keywords classified as 'Complement'\n"
        "2. Score every BlackBox product using fuzzy + token-overlap similarity\n"
        "3. Compute complement_strength per product\n"
        "4. Identify cross-sell opportunities via keyword bridging\n\n"
        "**Formula**: `Complement Strength = 0.7 × similarity + 0.3 × keyword_breadth`. "
        "`Ecosystem Strength = min(density × mean_strength × 3, 100)`.\n\n"
        "**Returns**: complement keywords, matched products, ecosystem clusters, "
        "cross-sell opportunities, ecosystem strength 0-100."
    ),
)
def complement_intelligence(top_n: int = 10):
    logger.info(f"Complement Intelligence requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Complement Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Complement Intelligence", "blackbox")
    cached = analysis_cache.get_engine("complement")
    if cached:
        return format_response(cached)
    result = complement_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Complement Intelligence complete — status={result['status']}, "
        f"complements={result.get('results', {}).get('total_complement_products', 'n/a')}"
    )
    return format_response(result)


@router.post(
    "/bundle-opportunities",
    response_model=StandardResponse,
    summary="Bundle Opportunity Analysis",
    description=(
        "Identifies high-potential bundle combinations using complement relationships.\n\n"
        "**Datasets**: Keyword Classification + BlackBox Products\n\n"
        "**Logic**:\n"
        "1. Runs complement engine to find complement products\n"
        "2. Scores (primary, complement) product pairs by demand overlap\n"
        "3. Applies category adjacency bonus\n"
        "4. Normalises bundle scores to 0-100\n\n"
        "**Formula**: `Bundle Score = (complement_strength × 0.4) + "
        "(demand_overlap × 0.4) + (category_adjacency × 0.2)`. "
        "`Ecosystem Strength = min(density × mean_score × 5, 100)`.\n\n"
        "**Returns**: ranked bundle pairs, high-potential bundles (score ≥70), "
        "bundle clusters by subcategory, ecosystem strength 0-100."
    ),
)
def bundle_opportunities(top_n: int = 10):
    logger.info(f"Bundle Opportunities requested (top_n={top_n})")
    kc_df       = registry.get_keyword_classification()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Bundle Opportunity", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Bundle Opportunity", "blackbox")
    cached = analysis_cache.get_engine("bundle")
    if cached:
        return format_response(cached)
    result = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n)
    logger.info(
        f"Bundle Opportunities complete — status={result['status']}, "
        f"bundles={result.get('results', {}).get('total_bundle_opportunities', 'n/a')}"
    )
    return format_response(result)


@router.get(
    "/analysis-snapshot",
    summary="Cached analysis outputs",
    description="Returns the most recent full analysis run (single source of truth for UI and report).",
)
def analysis_snapshot():
    snap = analysis_cache.get_snapshot()
    if not snap:
        return format_response({"status": "error", "message": "No analysis run yet. Upload data and open Dashboard or Market Report."})
    return format_response({"status": "success", **snap})


@router.get(
    "/processing-status",
    summary="Background processing status",
    description="Returns the current state of background engine processing.",
)
def processing_status():
    status = analysis_cache.get_status()
    return format_response({"status": "success", **status})



@router.post(
    "/product-intelligence",
    response_model=StandardResponse,
    summary="Product Intelligence",
    description=(
        "Combined Product Intelligence page output. Returns only top 5 Direct Competitors, "
        "Substitutes, Complements, and Bundle Opportunities for the UI."
    ),
)
def product_intelligence(top_n: int = 5, price_tolerance_pct: float = 17.5):
    logger.info(f"Product Intelligence requested (top_n={top_n})")

    blackbox_df = registry.get_blackbox()
    kc_df = registry.get_keyword_classification()

    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Product Intelligence", "blackbox")

    direct_cached = analysis_cache.get_engine("direct_competitors")
    substitute_cached = analysis_cache.get_engine("substitute")
    complement_cached = analysis_cache.get_engine("complement")
    bundle_cached = analysis_cache.get_engine("bundle")

    direct_result = direct_cached or direct_competitor_engine.run(
        None,
        blackbox_df,
        top_n=top_n,
        price_tolerance_pct=price_tolerance_pct,
    )

    if is_empty_dataframe(kc_df):
        substitute_result = _datasets_not_loaded(
            "Substitute Intelligence",
            "keyword_classification",
        )["data"]
        complement_result = _datasets_not_loaded(
            "Complement Intelligence",
            "keyword_classification",
        )["data"]
        bundle_result = _datasets_not_loaded(
            "Bundle Opportunity",
            "keyword_classification",
        )["data"]
    else:
        substitute_result = substitute_cached or substitute_engine.run(
            kc_df,
            blackbox_df,
            top_n=top_n,
        )
        complement_result = complement_cached or complement_engine.run(
            kc_df,
            blackbox_df,
            top_n=top_n,
        )
        bundle_result = bundle_cached or bundle_opportunity_engine.run(
            kc_df,
            blackbox_df,
            top_n=top_n,
        )

    return format_response({
        "status": "success",
        "message": "Product Intelligence generated successfully",
        "results": {
            "direct_competitors": direct_result.get("results", {}),
            "substitutes": substitute_result.get("results", {}),
            "complements": complement_result.get("results", {}),
            "bundle_opportunities": bundle_result.get("results", {}),
        },
        "engine_outputs": {
            "direct_competitors": direct_result,
            "substitute": substitute_result,
            "complement": complement_result,
            "bundle": bundle_result,
        },
    })


# =========================================================================
# Finance Intelligence
# =========================================================================

@router.post(
    "/finance-intelligence",
    response_model=StandardResponse,
    summary="Finance Intelligence",
    description=(
        "Market economics pillar: advertising pressure, premium viability, "
        "margin compression, capital efficiency, and entry cost.\n\n"
        "**Datasets**: Magnet (keyword) + BlackBox (products)\n\n"
        "**Aggregates**: Finance Health Score (0–100) with economic verdict.\n\n"
        "Returns insufficient_data for individual metrics when required columns are missing."
    ),
)
def finance_intelligence(top_n: int = 10):
    logger.info("Finance Intelligence requested")
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Finance Intelligence", "magnet and/or blackbox")
    cached = analysis_cache.get_engine("finance")
    if cached:
        return format_response(cached)
    demand_score = None
    # Try to get demand score from cache first to avoid re-running demand engine
    demand_cached = analysis_cache.get_engine("demand")
    if demand_cached and demand_cached.get("status") == "success":
        demand_score = (
            demand_cached.get("results", {}).get("market_demand_index")
            or demand_cached.get("results", {}).get("overall_demand_score")
        )
    elif not (is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df)):
        demand_res = demand_engine.run(magnet_df, blackbox_df, top_n=top_n)
        if demand_res.get("status") == "success":
            demand_score = demand_res.get("results", {}).get("overall_demand_score")
    result = run_finance_intelligence(magnet_df, blackbox_df, demand_score=demand_score)
    logger.info(
        f"Finance Intelligence complete — status={result['status']}, "
        f"health={result.get('results', {}).get('finance_health', {}).get('finance_health')}"
    )
    return format_response(result)


# =========================================================================
# Market Report
# =========================================================================

def _build_report_from_snapshot(top_n: int = 10):
    """Single analysis run — report and UI share cached engine outputs."""
    logger.info(f"Building market report snapshot (top_n={top_n})")
    
    blackbox_df = registry.get_blackbox()
    magnet_df = registry.get_magnet()
    
    logger.info(f"Datasets loaded: blackbox={len(blackbox_df) if blackbox_df is not None else 0}, magnet={len(magnet_df) if magnet_df is not None else 0}")
    
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Report", "blackbox")

    snapshot = analysis_cache.get_snapshot()
    if not snapshot or snapshot.get("top_n") != top_n:
        logger.info(f"Cache miss or top_n mismatch, running all engines")
        snapshot = run_all_engines(top_n=top_n)

    engines = snapshot.get("engines", {})
    logger.info(f"Engines snapshot ready: {list(engines.keys())}")

    def _eng(key: str):
        return engines.get(key) or {}

    try:
        logger.info("Starting market report generation from engines")
        report = build_report(
            demand_result=_eng("demand"),
            sales_result=_eng("sales_momentum"),
            revenue_result=_eng("revenue_momentum"),
            bsr_result=_eng("bsr_efficiency"),
            siei_result=_eng("siei") or None,
            whitespace_result=_eng("whitespace") or None,
            direct_comp_result=_eng("direct_competitors") or None,
            price_elasticity_result=_eng("price_elasticity") or None,
            hhi_result=_eng("hhi") or None,
            demand_vel_result=_eng("demand_velocity") or None,
            substitute_result=_eng("substitute") or None,
            complement_result=_eng("complement") or None,
            bundle_result=_eng("bundle") or None,
            finance_result=_eng("finance") or None,
            blackbox_df=blackbox_df,
            magnet_df=magnet_df,
            top_n=top_n,
        )
        logger.info(f"Market report generation succeeded")

        if report.get("results") is not None:
            report["results"]["engine_outputs"] = engines

        return format_response(report)
    except Exception as e:
        logger.exception(f"Market report generation failed: {str(e)}")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Market report generation failed: {str(e)}"
        )


@router.get(
    "/market-report",
    response_model=StandardResponse,
    summary="Full Market Intelligence Report",
    description=(
        "Runs all engines and aggregates results into a structured business intelligence report.\n\n"
        "**Requires**: BlackBox dataset mandatory. Magnet dataset optional, enriches demand.\n\n"
        "**Returns**: JSON report with rankings, opportunity findings, risk findings, "
        "and Markdown narrative. Future-ready for PDF/HTML export."
    ),
)
def market_report(top_n: int = 10):
    logger.info(f"Market Report requested (top_n={top_n})")
    report = _build_report_from_snapshot(top_n=top_n)
    logger.info("Market Report complete")
    return report


@router.get(
    "/overview-verification",
    response_model=StandardResponse,
    summary="Overview verification breakdown",
    description=(
        "Temporary verification endpoint returning raw first-page overview calculations "
        "from loaded datasets and parity checks against /market-report output."
    ),
)
def overview_verification(top_n: int = 10):
    blackbox_df = registry.get_blackbox()
    magnet_df = registry.get_magnet()
    if is_empty_dataframe(blackbox_df) or is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Overview Verification", "blackbox and magnet")

    parent_revenue_col = _find_column(blackbox_df, ["Parent Level Revenue", "Revenue"])
    brand_col = _find_column(blackbox_df, ["Brand", "Brand Name"])
    asin_col = _find_column(blackbox_df, ["ASIN"])
    title_col = _find_column(blackbox_df, ["Title", "Product Title", "Product Name"])
    price_col = _find_column(blackbox_df, ["Price", "Listing Price", "Current Price"])

    revenue_series = _to_numeric_series(blackbox_df[parent_revenue_col]).fillna(0.0) if parent_revenue_col else None
    total_revenue = float(revenue_series[revenue_series > 0].sum()) if revenue_series is not None else 0.0

    product_source = "none"
    total_products = 0
    if asin_col and asin_col in blackbox_df.columns:
        asin_values = (
            blackbox_df[asin_col]
            .astype(str)
            .str.strip()
            .replace({"": None, "nan": None, "none": None, "null": None})
            .dropna()
        )
        total_products = int(asin_values.nunique())
        product_source = "ASIN"
    elif title_col and title_col in blackbox_df.columns:
        titles = blackbox_df[title_col].map(_normalize_text)
        titles = titles[titles != ""]
        total_products = int(titles.nunique())
        product_source = "normalized_title"

    market_leader_brand = "N/A"
    market_leader_revenue = 0.0
    market_leader_share = 0.0
    if brand_col and revenue_series is not None and total_revenue > 0:
        work = blackbox_df[[brand_col]].copy()
        work["_revenue"] = revenue_series
        work = work[work["_revenue"] > 0]
        if not work.empty:
            work["_brand"] = work[brand_col].astype(str).str.strip().replace({"": "Unknown Brand"})
            grouped = work.groupby("_brand", observed=False)["_revenue"].sum().sort_values(ascending=False)
            if not grouped.empty:
                market_leader_brand = str(grouped.index[0])
                market_leader_revenue = float(grouped.iloc[0])
                market_leader_share = (market_leader_revenue / total_revenue) * 100.0

    demand_hotspot = _build_demand_hotspot(magnet_df)
    primary_cluster = _build_primary_price_cluster(blackbox_df, total_revenue)

    report_resp = _build_report_from_snapshot(top_n=top_n)
    report_data = report_resp.get("data", {})
    report_results = report_data.get("results", {})
    snapshot = report_results.get("market_snapshot", {})
    report_price = report_results.get("primary_price_cluster", {})
    report_verification = report_results.get("overview_verification", {})

    parity_checks = {
        "snapshot_total_revenue_matches_raw": snapshot.get("total_revenue") == (f"${total_revenue:,.0f}" if total_revenue > 0 else "N/A"),
        "snapshot_total_products_matches_raw": int(snapshot.get("total_products") or 0) == int(total_products),
        "snapshot_market_leader_matches_raw": snapshot.get("market_leader") == market_leader_brand,
        "snapshot_market_leader_share_matches_raw": snapshot.get("market_leader_share") == (f"{market_leader_share:.1f}%" if market_leader_share > 0 else "N/A"),
        "price_cluster_range_matches_raw": report_price.get("dominant_range") == primary_cluster.get("dominant_range"),
        "price_cluster_share_matches_raw": report_price.get("revenue_share") == primary_cluster.get("revenue_share"),
        "verification_block_present": bool(report_verification),
        "price_column_detected": bool(price_col),
    }

    return format_response({
        "status": "success",
        "message": "Overview verification breakdown generated",
        "results": {
            "raw_breakdown": {
                "revenue_total_parent_level": total_revenue,
                "product_count": total_products,
                "product_count_source": product_source,
                "market_leader_brand": market_leader_brand,
                "market_leader_revenue": market_leader_revenue,
                "market_leader_share_pct": round(market_leader_share, 4),
                "demand_hotspot_cluster": demand_hotspot.get("cluster_name", "N/A"),
                "demand_hotspot_combined_volume": float(demand_hotspot.get("cluster_search_volume", 0.0) or 0.0),
                "demand_hotspot_phrase_count": int(demand_hotspot.get("keyword_count", 0) or 0),
                "primary_price_bucket": primary_cluster.get("dominant_range", "N/A"),
                "primary_price_bucket_revenue": float(primary_cluster.get("range_revenue", 0.0) or 0.0),
                "primary_price_bucket_product_count": int(primary_cluster.get("product_count", 0) or 0),
                "primary_price_bucket_share_pct": float(str(primary_cluster.get("revenue_share", "0")).replace("%", "") or 0.0),
            },
            "market_report_snapshot": {
                "market_snapshot": snapshot,
                "primary_price_cluster": report_price,
                "overview_verification": report_verification,
            },
            "parity_checks": parity_checks,
        },
    })


@router.get(
    "/market-report/pdf",
    summary="Download Market Report PDF",
    description="Generates a deterministic PDF report from current engine outputs.",
)
def market_report_pdf(top_n: int = 10, report_mode: str = "executive", include_charts: bool = True):
    logger.info(f"Market Report PDF requested (top_n={top_n}, report_mode={report_mode}, include_charts={include_charts})")
    report = _build_report_from_snapshot(top_n=top_n)
    if not report.get("success"):
        return report
    if not report.get("data") or not report["data"].get("results"):
        return report
    pdf_path = export_market_report_pdf(report["data"], report_mode=report_mode, include_charts=include_charts)
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename="market_intelligence_report.pdf",
    )


# =========================================================================
# Internal helper
# =========================================================================

def _datasets_not_loaded(metric_name: str, required: str) -> dict:
    msg = f"Required dataset(s) not uploaded: {required}. Use POST /api/v1/upload-datasets first."
    logger.warning(f"{metric_name}: {msg}")
    return format_response({
        "status": "error",
        "message": msg,
        "metric_name": metric_name,
        "summary": msg,
        "datasets_used": [],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": msg,
            "missing_columns": [],
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    })
