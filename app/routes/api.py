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
    data: Any
    error: Optional[str] = None
    meta: Optional[dict] = {}

class CategoryScopePayload(BaseModel):
    mode: Optional[str] = "all"
    selected_categories: Optional[list[str]] = []
    category_column: Optional[str] = ""
    scope_key: Optional[str] = "all"
    keyword_scope_key: Optional[str] = "all"


def _scope_payload_dict(scope: CategoryScopePayload) -> dict:
    if hasattr(scope, "model_dump"):
        return scope.model_dump()
    return scope.dict()


def _resolve_context(scope: CategoryScopePayload):
    from app.utils.scope_resolver import resolve_analysis_datasets, enrich_scope_dict
    scope_dict = enrich_scope_dict(_scope_payload_dict(scope))
    return resolve_analysis_datasets(registry, scope_dict)

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
    message = result.get('message') or result.get('summary') or None
    
    error = message if not success else None
    
    return {
        'success': success,
        'data': sanitize_payload(result),
        'error': error,
        'meta': {}
    }

logger = get_logger("routes")
router = APIRouter(prefix="/api/v1", tags=["Market Intelligence"])


def _guard_scoped_analysis():
    """Block product-based engines until BlackBox category scope is confirmed."""
    ready, msg = registry.analysis_readiness()
    if not ready:
        return format_response({"status": "error", "message": msg})
    return None


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
    from app.services.llm_service import check_llm_provider
    scope = registry.get_category_scope()
    meta = registry.get_meta()
    bb_meta = meta.get("blackbox", {})
    llm_ok, llm_model = check_llm_provider()
    return format_response({
        "status": "ok",
        "datasets": registry.get_status(),
        "metadata": meta,
        "rows_loaded": registry.rows_loaded(),
        "category_scope": scope,
        "session_id": bb_meta.get("timestamp"),
        "llm_provider": {
            "available": llm_ok,
            "model": llm_model if llm_ok else None,
            "message": None if llm_ok else llm_model,
        },
    })


# =========================================================================
# Dataset Upload
# =========================================================================


@router.get(
    "/detect-categories",
    summary="Detect BlackBox categories",
    description="Returns a list of unique categories found in the uploaded BlackBox dataset.",
)
def detect_categories():
    try:
        logger.info("Detecting categories from uploaded BlackBox dataset")
        
        # Check if BlackBox is loaded
        if not registry.is_blackbox_uploaded():
            logger.warning("Detect-categories called but BlackBox dataset not loaded")
            return format_response({
                "status": "error",
                "message": "BlackBox dataset not loaded. Please upload a BlackBox CSV file first.",
                "error_type": "dataset_not_loaded"
            })
        
        # Get detected categories
        res = registry.get_detected_categories()
        logger.info(f"Categories detected: {res.get('has_categories', False)}, count: {len(res.get('categories', []))}")
        
        if not res.get('has_categories', False):
            logger.info("No categories found in dataset - single category or no category column")
        
        return format_response(res)
        
    except KeyError as e:
        logger.error(f"Schema error detecting categories - missing column: {str(e)}", exc_info=True)
        return format_response({
            "status": "error",
            "message": f"BlackBox schema error: missing required column '{str(e)}'",
            "error_type": "schema_error",
            "missing_column": str(e)
        })
    except Exception as e:
        logger.error(f"Unexpected error detecting categories: {str(e)}", exc_info=True)
        return format_response({
            "status": "error",
            "message": f"Internal server error while detecting categories: {str(e)}",
            "error_type": "internal_error"
        })

from pydantic import BaseModel
class SetCategoryRequest(BaseModel):
    categories: list[str]


class StartAnalysisRequest(BaseModel):
    use_full_blackbox: bool = False


def _start_analysis_background(background_tasks: BackgroundTasks) -> None:
    ready, msg = registry.analysis_readiness()
    if not ready:
        logger.warning("Analysis not started: %s", msg)
        return
    analysis_cache.clear()
    background_tasks.add_task(run_all_engines)


@router.post(
    "/set-category",
    summary="Set active categories",
    description="Filters BlackBox to selected categories, then starts analysis.",
)
def set_category(req: SetCategoryRequest, background_tasks: BackgroundTasks):
    logger.info("Setting category to: %s", req.categories)
    res = registry.set_category(req.categories)
    if res.get("status") != "success":
        return format_response(res)
    _start_analysis_background(background_tasks)
    res["analysis_started"] = True
    return format_response(res)


@router.post(
    "/start-analysis",
    summary="Start analysis",
    description=(
        "Runs all engines on the scoped datasets."
    ),
)
def start_analysis(req: StartAnalysisRequest, background_tasks: BackgroundTasks):
    logger.info("Manual start analysis requested")
    _start_analysis_background(background_tasks)
    return format_response({
        "status": "success",
        "message": "Analysis started on scoped datasets.",
        "category_scope": registry.get_category_scope(),
    })


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
                registry.set_blackbox(df, filename=blackbox.filename)
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
                registry.set_magnet(df, filename=magnet.filename)
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
                registry.set_keyword_classification(df, filename=keyword_classification.filename)
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

    # Analysis starts only after category selection (/set-category) or /start-analysis
    return format_response({
        "status": overall,
        "message": message,
        "datasets_loaded": datasets_loaded,
        "rows_loaded": rows_loaded,
        "errors": errors if errors else None,
    })


@router.post(
    "/remove-dataset/{dataset_type}",
    response_model=StandardResponse,
    summary="Remove a dataset",
    description="Removes a specific dataset from the registry and clears the analysis cache.",
)
def remove_dataset(dataset_type: str):
    logger.info(f"Removing dataset: {dataset_type}")
    res = registry.remove_dataset(dataset_type)
    if res.get("status") == "success":
        analysis_cache.clear()
    return format_response(res)


# =========================================================================
# Data scope registry (single source of truth for UI + audit)
# =========================================================================

@router.get(
    "/page-data-scope",
    response_model=StandardResponse,
    summary="Page data scope registry",
    description="Returns the canonical keyword/product scope declaration for each dashboard page.",
)
def page_data_scope():
    from app.utils.page_scope_registry import PAGE_SCOPE_REGISTRY
    return format_response({
        "status": "success",
        "pages": PAGE_SCOPE_REGISTRY,
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
def demand_strength(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Demand Strength requested (top_n={top_n})")
    if registry.is_blackbox_uploaded():
        guard = _guard_scoped_analysis()
        if guard:
            return guard

    from app.utils.scope_resolver import attach_scope_to_result
    blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)

    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Strength", "magnet and/or blackbox")

    cached = analysis_cache.get_engine("demand", cache_key)
    if cached:
        return format_response(cached)
    result = demand_engine.run(magnet_df, blackbox_df, top_n=top_n, keyword_classification_df=kc_df)
    attach_scope_to_result(result, scope_meta, kw_meta, "demand_strength")
    analysis_cache.set_engine("demand", result, cache_key)
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
def sales_momentum(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Sales Momentum requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard

    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Sales Momentum", "blackbox")

    cached = analysis_cache.get_engine("sales_momentum", cache_key)
    if cached:
        return format_response(cached)
    result = sales_momentum_engine.run(blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("sales_momentum", result, cache_key)
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
def revenue_momentum(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Revenue Momentum requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard

    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Revenue Momentum", "blackbox")

    cached = analysis_cache.get_engine("revenue_momentum", cache_key)
    if cached:
        return format_response(cached)
    result = revenue_momentum_engine.run(blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("revenue_momentum", result, cache_key)
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
def bsr_efficiency(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"BSR Efficiency requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard

    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("BSR Efficiency", "blackbox")

    cached = analysis_cache.get_engine("bsr_efficiency", cache_key)
    if cached:
        return format_response(cached)
    result = bsr_efficiency_engine.run(blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("bsr_efficiency", result, cache_key)
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
def demand_velocity(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Demand Velocity requested (top_n={top_n})")
    if registry.is_blackbox_uploaded():
        guard = _guard_scoped_analysis()
        if guard:
            return guard
    from app.utils.scope_resolver import attach_scope_to_result
    blackbox_df, magnet_df, _kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Demand Velocity", "magnet and/or blackbox")
    cached = analysis_cache.get_engine("demand_velocity", cache_key)
    if cached:
        return format_response(cached)
    result = demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n)
    attach_scope_to_result(result, scope_meta, kw_meta, "demand_velocity")
    analysis_cache.set_engine("demand_velocity", result, cache_key)
    return format_response(result)


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
def search_intent_efficiency(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"SIEI requested (top_n={top_n})")
    from app.utils.scope_resolver import attach_scope_to_result
    blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Search Intent Efficiency Index (SIEI)", "magnet")
    cached = analysis_cache.get_engine("siei", cache_key)
    if cached:
        return format_response(cached)
    result = siei_engine.run(magnet_df, keyword_classification_df=kc_df, top_n=top_n)
    attach_scope_to_result(result, scope_meta, kw_meta, "inbound_efficiency")
    analysis_cache.set_engine("siei", result, cache_key)
    return format_response(result)


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
def market_concentration(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Market Concentration requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Market Concentration Index (HHI)", "blackbox")
    cached = analysis_cache.get_engine("hhi", cache_key)
    if cached:
        return format_response(cached)
    result = hhi_engine.run(blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("hhi", result, cache_key)
    return format_response(result)


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
def whitespace_opportunities(scope: CategoryScopePayload, top_n: int = 15):
    logger.info(f"Whitespace Opportunity requested (top_n={top_n})")
    from app.utils.scope_resolver import attach_scope_to_result
    blackbox_df, magnet_df, _kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)
    if is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Whitespace Opportunity", "magnet")
    cached = analysis_cache.get_engine("whitespace", cache_key)
    if cached:
        return format_response(cached)
    result = whitespace_engine.run(
        magnet_df,
        blackbox_df if not is_empty_dataframe(blackbox_df) else None,
        top_n=top_n,
    )
    attach_scope_to_result(result, scope_meta, kw_meta, "whitespace")
    analysis_cache.set_engine("whitespace", result, cache_key)
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
def revenue_opportunity_segment_keywords(segment_name: str, scope_key: str = "all"):
    logger.info(f"Revenue Opportunity keywords requested for segment={segment_name}")

    # ── Primary path: read from the cached whitespace run (exact same segments) ──
    cached_ws = analysis_cache.get_engine("whitespace", scope_key)
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
    blackbox_df, scope_meta = registry.get_scoped_blackbox_df(scope.dict() if hasattr(scope, 'dict') else scope)
    magnet_df, kw_meta = registry.get_scoped_magnet_df(scope.dict() if hasattr(scope, 'dict') else scope, blackbox_df)
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
def direct_competitors(scope: CategoryScopePayload, top_n: int = 15, price_tolerance_pct: float = 17.5):
    logger.info(f"Direct Competitors requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Direct Competitors", "blackbox")
    cached = analysis_cache.get_engine("direct_competitors", cache_key)
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
def price_elasticity(scope: CategoryScopePayload, n_buckets: int = 5):
    logger.info(f"Price Elasticity requested (n_buckets={n_buckets})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, _kc, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Price Elasticity", "blackbox")
    cached = analysis_cache.get_engine("price_elasticity", cache_key)
    if cached:
        return format_response(cached)
    result = price_elasticity_engine.run(None, blackbox_df, n_buckets=n_buckets)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("price_elasticity", result, cache_key)
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
def substitute_intelligence(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Substitute Intelligence requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, kc_df, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Substitute Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Substitute Intelligence", "blackbox")
    cached = analysis_cache.get_engine("substitute", cache_key)
    if cached:
        return format_response(cached)
    result = substitute_engine.run(kc_df, blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("substitute", result, cache_key)
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
def complement_intelligence(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Complement Intelligence requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, kc_df, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Complement Intelligence", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Complement Intelligence", "blackbox")
    cached = analysis_cache.get_engine("complement", cache_key)
    if cached:
        return format_response(cached)
    result = complement_engine.run(kc_df, blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("complement", result, cache_key)
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
def bundle_opportunities(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Bundle Opportunities requested (top_n={top_n})")
    guard = _guard_scoped_analysis()
    if guard:
        return guard
    blackbox_df, _magnet, kc_df, scope_meta, _kw, cache_key = _resolve_context(scope)
    if is_empty_dataframe(kc_df):
        return _datasets_not_loaded("Bundle Opportunity", "keyword_classification")
    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Bundle Opportunity", "blackbox")
    cached = analysis_cache.get_engine("bundle", cache_key)
    if cached:
        return format_response(cached)
    result = bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n)
    if 'scope' not in result:
        result['scope'] = scope_meta
    analysis_cache.set_engine("bundle", result, cache_key)
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
def product_intelligence(scope: CategoryScopePayload, top_n: int = 5, price_tolerance_pct: float = 17.5):
    logger.info(f"Product Intelligence requested (top_n={top_n})")

    from app.utils.scope_resolver import attach_scope_to_result, build_data_scope
    blackbox_df, _magnet, kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)

    if is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Product Intelligence", "blackbox")

    direct_cached = analysis_cache.get_engine("direct_competitors", cache_key)
    substitute_cached = analysis_cache.get_engine("substitute", cache_key)
    complement_cached = analysis_cache.get_engine("complement", cache_key)
    bundle_cached = analysis_cache.get_engine("bundle", cache_key)

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
            "data_scope": build_data_scope(scope_meta, kw_meta),
        },
        "page_scope": {
            "page_id": "product_intelligence",
            "keyword_scope": "global",
            "product_scope": "filtered",
            "category_dependency": True,
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
def finance_intelligence(scope: CategoryScopePayload, top_n: int = 10):
    logger.info("Finance Intelligence requested")
    if registry.is_blackbox_uploaded():
        guard = _guard_scoped_analysis()
        if guard:
            return guard
    from app.utils.scope_resolver import attach_scope_to_result
    blackbox_df, magnet_df, _kc, scope_meta, kw_meta, cache_key = _resolve_context(scope)
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return _datasets_not_loaded("Finance Intelligence", "magnet and/or blackbox")
    cached = analysis_cache.get_engine("finance", cache_key)
    if cached:
        return format_response(cached)
    demand_score = None
    demand_cached = analysis_cache.get_engine("demand", cache_key)
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
    attach_scope_to_result(result, scope_meta, kw_meta, "finance_intelligence")
    analysis_cache.set_engine("finance", result, cache_key)
    logger.info(
        f"Finance Intelligence complete — status={result['status']}, "
        f"health={result.get('results', {}).get('finance_health', {}).get('finance_health')}"
    )
    return format_response(result)


# =========================================================================
# Market Report
# =========================================================================

def _scoped_engine(name: str, cache_key: str, runner, *args, **kwargs) -> dict:
    cached = analysis_cache.get_engine(name, cache_key)
    if cached:
        return cached
    result = runner(*args, **kwargs)
    analysis_cache.set_engine(name, result, cache_key)
    return result


def _build_market_report(scope: CategoryScopePayload, top_n: int = 10):
    """Build report from category-scoped datasets and scoped engine cache with graceful degradation."""
    from app.utils.scope_resolver import attach_scope_to_result

    logger.info(f"[MARKET REPORT] Building scoped market report (top_n={top_n})")
    
    try:
        blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key = _resolve_context(scope)
    except Exception as e:
        logger.exception(f"[MARKET REPORT] Failed to resolve context: {str(e)}")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Failed to resolve analysis context: {str(e)}",
        )

    if is_empty_dataframe(blackbox_df):
        logger.warning("[MARKET REPORT] BlackBox dataset not loaded")
        return _datasets_not_loaded("Market Report", "blackbox")

    logger.info(
        "[MARKET REPORT] Datasets loaded: blackbox=%d rows, magnet=%d rows, kc=%d rows, cache_key=%s",
        len(blackbox_df) if blackbox_df is not None else 0,
        len(magnet_df) if magnet_df is not None else 0,
        len(kc_df) if kc_df is not None else 0,
        cache_key,
    )

    engines: dict = {}
    skipped_reasons: dict = {}
    sections_generated = 0
    sections_skipped = 0

    def _safe_engine(key: str, name: str, cache_key: str, runner, *args, **kwargs):
        nonlocal sections_generated, sections_skipped
        try:
            cached = analysis_cache.get_engine(name, cache_key)
            if cached:
                engines[key] = cached
                if cached.get("status") == "error":
                    skipped_reasons[key] = cached.get("message", "Cached error")
                    sections_skipped += 1
                else:
                    sections_generated += 1
                return
            result = runner(*args, **kwargs)
            if result.get("status") == "error":
                engines[key] = result
                skipped_reasons[key] = result.get("message", "Engine reported error")
                sections_skipped += 1
            else:
                analysis_cache.set_engine(name, result, cache_key)
                engines[key] = result
                sections_generated += 1
        except Exception as e:
            logger.exception(f"[MARKET REPORT] Engine {key} failed: {e}")
            engines[key] = {"status": "error", "message": f"Exception: {str(e)}"}
            skipped_reasons[key] = f"Exception: {str(e)}"
            sections_skipped += 1

    if not is_empty_dataframe(magnet_df) or not is_empty_dataframe(blackbox_df):
        _safe_engine("demand", "demand", cache_key, demand_engine.run, magnet_df, blackbox_df, top_n=top_n, keyword_classification_df=kc_df)
        if engines.get("demand", {}).get("status") != "error":
            attach_scope_to_result(engines["demand"], scope_meta, kw_meta)

    if not is_empty_dataframe(blackbox_df):
        _safe_engine("sales_momentum", "sales_momentum", cache_key, sales_momentum_engine.run, blackbox_df, top_n)
        _safe_engine("revenue_momentum", "revenue_momentum", cache_key, revenue_momentum_engine.run, blackbox_df, top_n)
        _safe_engine("bsr_efficiency", "bsr_efficiency", cache_key, bsr_efficiency_engine.run, blackbox_df, top_n)
        _safe_engine("hhi", "hhi", cache_key, hhi_engine.run, blackbox_df, top_n)
        _safe_engine("price_elasticity", "price_elasticity", cache_key, price_elasticity_engine.run, None, blackbox_df)
        _safe_engine("direct_competitors", "direct_competitors", cache_key, direct_competitor_engine.run, None, blackbox_df, top_n)

    if not is_empty_dataframe(magnet_df):
        _safe_engine("siei", "siei", cache_key, siei_engine.run, magnet_df, keyword_classification_df=kc_df, top_n=top_n)
        if engines.get("siei", {}).get("status") != "error":
            attach_scope_to_result(engines["siei"], scope_meta, kw_meta)
            
        _safe_engine("whitespace", "whitespace", cache_key, whitespace_engine.run, magnet_df, blackbox_df if not is_empty_dataframe(blackbox_df) else None, top_n)
        if engines.get("whitespace", {}).get("status") != "error":
            attach_scope_to_result(engines["whitespace"], scope_meta, kw_meta)
            
        _safe_engine("demand_velocity", "demand_velocity", cache_key, demand_velocity_engine.run, magnet_df, blackbox_df, top_n=top_n)

    if not is_empty_dataframe(kc_df) and not is_empty_dataframe(blackbox_df):
        _safe_engine("substitute", "substitute", cache_key, substitute_engine.run, kc_df, blackbox_df, top_n)
        _safe_engine("complement", "complement", cache_key, complement_engine.run, kc_df, blackbox_df, top_n)
        _safe_engine("bundle", "bundle", cache_key, bundle_opportunity_engine.run, kc_df, blackbox_df, top_n)

    demand_score = (
        engines.get("demand", {}).get("results", {}).get("market_demand_index")
        or engines.get("demand", {}).get("results", {}).get("overall_demand_score")
    )
    _safe_engine("finance", "finance", cache_key, run_finance_intelligence, magnet_df, blackbox_df, demand_score=demand_score)
    if engines.get("finance", {}).get("status") != "error":
        attach_scope_to_result(engines["finance"], scope_meta, kw_meta)

    def _eng(key: str):
        return engines.get(key) or {}

    try:
        logger.info("[MARKET REPORT] Building report from engine outputs...")
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
            scope_meta=scope_meta,
            kw_meta=kw_meta,
        )
        if report.get("results") is not None:
            report["results"]["engine_outputs"] = engines
            report["results"]["scope"] = scope_meta
            report["results"]["keyword_scope"] = kw_meta
            report["results"]["sections_generated"] = sections_generated
            report["results"]["sections_skipped"] = sections_skipped
            report["results"]["skipped_reasons"] = skipped_reasons
        logger.info("[MARKET REPORT] Report generation completed successfully")
        return format_response(report)
    except Exception as e:
        logger.exception(f"[MARKET REPORT] Report aggregation failed: {str(e)}")
        # Graceful fallback: return partial data and error status
        partial_report = {
            "status": "error",
            "message": f"Market report aggregation failed: {str(e)}",
            "results": {
                "sections_generated": sections_generated,
                "sections_skipped": sections_skipped,
                "skipped_reasons": skipped_reasons,
                "engine_outputs": engines
            }
        }
        return format_response(partial_report)


@router.get(
    "/market-report",
    response_model=StandardResponse,
    summary="Full Market Intelligence Report (GET)",
    description="GET alias for market report using the active registry category scope.",
)
def market_report_get(top_n: int = 10):
    from app.utils.scope_resolver import scope_from_registry
    scope_dict = scope_from_registry(registry.get_category_scope())
    return _build_market_report(CategoryScopePayload(**scope_dict), top_n=top_n)


@router.post(
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
def market_report(scope: CategoryScopePayload, top_n: int = 10):
    logger.info(f"Market Report requested (top_n={top_n})")
    return _build_market_report(scope, top_n=top_n)


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
    from app.utils.scope_resolver import scope_from_registry
    scope_dict = scope_from_registry(registry.get_category_scope())
    blackbox_df, magnet_df, _kc, scope_meta, kw_meta, cache_key = _resolve_context(
        CategoryScopePayload(**scope_dict)
    )
    if is_empty_dataframe(blackbox_df) or is_empty_dataframe(magnet_df):
        return _datasets_not_loaded("Overview Verification", "scoped blackbox and magnet")

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

    from app.utils.scope_resolver import scope_from_registry
    scope_dict = scope_from_registry(registry.get_category_scope())
    report_resp = _build_market_report(CategoryScopePayload(**scope_dict), top_n=top_n)
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


@router.post(
    "/market-report/pdf",
    summary="Download Market Report PDF",
    description="Generates a deterministic PDF report from current engine outputs.",
)
def market_report_pdf(scope: CategoryScopePayload, top_n: int = 10, report_mode: str = "executive", include_charts: bool = True):
    logger.info(f"Market Report PDF requested (top_n={top_n}, report_mode={report_mode}, include_charts={include_charts})")
    
    report = _build_market_report(scope, top_n=top_n)
    
    # If the report generation failed significantly (or returned an error object directly)
    if isinstance(report, dict) and not report.get("success"):
        return report
        
    data = report.get("data", {}) if isinstance(report, dict) else report
    if not data or not data.get("results"):
        return format_response({"status": "error", "message": "Failed to generate valid report data for PDF."})
        
    pdf_path = export_market_report_pdf(data, report_mode=report_mode, include_charts=include_charts)
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


# =========================================================================
# Consumer Adoption Simulator
# =========================================================================

@router.post(
    "/consumer-adoption-simulator",
    response_model=StandardResponse,
    summary="Consumer Adoption Simulator",
    description=(
        "Simulates how 1,000 realistic consumers would react to the product "
        "opportunity identified from the active dataset.  Aggregates all engine "
        "outputs into a MarketDNA, generates a consumer population, clusters into "
        "up to 20 psychographic segments, then computes adoption metrics and "
        "resistance barriers per segment."
    ),
)
def consumer_adoption_simulator(scope: CategoryScopePayload, population_size: int = 1000):
    logger.info("Consumer Adoption Simulator requested (population=%d)", population_size)

    from app.utils.scope_resolver import build_data_scope
    _bb, _mag, _kc, scope_meta, kw_meta, cache_key = _resolve_context(scope)

    def _cached(key: str):
        return analysis_cache.get_engine(key, cache_key)

    demand_result          = _cached("demand")
    demand_velocity_result = _cached("demand_velocity")
    siei_result            = _cached("siei")
    hhi_result             = _cached("hhi")
    price_result           = _cached("price_elasticity")
    revenue_momentum_result = _cached("revenue_momentum")
    bsr_result             = _cached("bsr_efficiency")

    # ── Validate — need at least one result to simulate ───────────────────────
    available = [r for r in [demand_result, siei_result, hhi_result] if r]
    if not available:
        return format_response({
            "status": "error",
            "message": (
                "No analysis results available. Run at least one engine "
                "(Demand Strength, Inbound Efficiency, or Market Concentration) "
                "before running the Consumer Adoption Simulator."
            ),
        })

    try:
        from app.services.consumer_adoption_simulator import (
            MarketDNAEngine,
            ConsumerPopulationEngine,
            PsychographicClusterEngine,
            AdoptionSimulationEngine,
            ResistanceAnalysisEngine,
            ScenarioTestingEngine,
            MarketStressTestEngine,
            SegmentStabilityEngine,
            MarketRiskEngine,
            SimulationConfidenceEngine,
        )

        # 1. Build MarketDNA
        dna_engine = MarketDNAEngine()
        dna = dna_engine.build(
            demand_result=demand_result,
            demand_velocity_result=demand_velocity_result,
            siei_result=siei_result,
            hhi_result=hhi_result,
            price_result=price_result,
            revenue_momentum_result=revenue_momentum_result,
            bsr_result=bsr_result,
        )

        # 2. Generate consumer population
        pop_engine = ConsumerPopulationEngine()
        consumers = pop_engine.generate(dna, population_size=min(population_size, 1000))

        # 3. Psychographic clustering
        cluster_engine = PsychographicClusterEngine()
        clusters = cluster_engine.cluster(consumers, dna)

        # 4. Adoption simulation
        adoption_engine = AdoptionSimulationEngine()
        adoption_results = adoption_engine.simulate(clusters, dna)

        # 5. Resistance analysis
        resistance_engine = ResistanceAnalysisEngine()
        resistance_results = resistance_engine.analyse(clusters, dna)

        # 6. Build enriched segments (needed for both response and insight context)
        resistance_by_id = {r.cluster_id: r.to_dict() for r in resistance_results}
        cluster_meta_by_id = {cl.cluster_id: cl for cl in clusters}

        enriched_segments = []
        for ar in adoption_results:
            enriched = ar.to_dict()
            enriched["resistance"] = resistance_by_id.get(ar.cluster_id, {})
            cl = cluster_meta_by_id.get(ar.cluster_id)
            if cl:
                enriched["motivations"]    = cl.motivations
                enriched["objections"]     = cl.objections
                enriched["dominant_traits"]= cl.dominant_traits
                enriched["primary_theme"]  = cl.primary_theme
            enriched_segments.append(enriched)

        # Population-level summary statistics (used in both response and insight context)
        total_pop      = len(consumers)
        avg_intent     = round(sum(a.purchase_intent        for a in adoption_results) / max(len(adoption_results), 1), 2)
        avg_conversion = round(sum(a.conversion_probability for a in adoption_results) / max(len(adoption_results), 1), 4)
        avg_trust      = round(sum(a.trust_score            for a in adoption_results) / max(len(adoption_results), 1), 2)
        avg_resistance = round(sum(r.resistance_index       for r in resistance_results) / max(len(resistance_results), 1), 2)
        avg_resonance  = round(sum(a.emotional_resonance    for a in adoption_results) / max(len(adoption_results), 1), 2)

        channel_votes: dict = {}
        for a in adoption_results:
            ch = a.channel_preference
            channel_votes[ch] = channel_votes.get(ch, 0) + a.population
        dominant_channel = max(channel_votes, key=lambda c: channel_votes[c]) if channel_votes else "Amazon"

        critical_barriers = [
            r.to_dict() for r in resistance_results if r.resistance_level in ("Critical", "High")
        ][:5]

        high_intent_segments = [
            a.to_dict() for a in adoption_results if a.purchase_intent >= 65
        ][:5]

        # 7. Generate AI insights from enriched simulation data
        from app.services.consumer_adoption_simulator.insight_engine import (
            InsightContextBuilder,
            SimulationInsightEngine,
        )
        population_summary_dict = {
            "total_consumers":            total_pop,
            "num_psychographic_segments": len(clusters),
            "avg_purchase_intent":        avg_intent,
            "avg_conversion_probability": avg_conversion,
            "avg_trust_score":            avg_trust,
            "avg_emotional_resonance":    avg_resonance,
            "avg_resistance_index":       avg_resistance,
            "dominant_channel":           dominant_channel,
            "channel_distribution":       channel_votes,
        }
        ctx_builder  = InsightContextBuilder()
        insight_ctx  = ctx_builder.build(
            market_dna=dna.to_dict(),
            population_summary=population_summary_dict,
            psychographic_segments=enriched_segments,
        )
        insight_engine_obj = SimulationInsightEngine()
        insight_output = insight_engine_obj.generate(insight_ctx)

        # 8. Calculate simulation confidence scores
        confidence_engine = SimulationConfidenceEngine()
        confidence_output = confidence_engine.calculate(
            dna_dict=dna.to_dict(),
            population_summary=population_summary_dict,
            enriched_segments=enriched_segments,
            data_completeness=dna.data_completeness,
        )

        # 9. Run scenario testing
        scenario_engine = ScenarioTestingEngine()
        scenario_output = scenario_engine.run(
            dna_dict=dna.to_dict(),
            enriched_segments=enriched_segments,
            population_summary=population_summary_dict,
        )

        # 10. Run market stress testing
        stress_test_engine = MarketStressTestEngine()
        stress_test_output = stress_test_engine.run(
            dna_dict=dna.to_dict(),
            population_summary=population_summary_dict,
            enriched_segments=enriched_segments,
        )

        # 11. Analyze segment stability
        stability_engine = SegmentStabilityEngine()
        stability_output = stability_engine.analyse(
            enriched_segments=enriched_segments,
            dna_dict=dna.to_dict(),
        )

        # 12. Calculate market risk
        risk_engine = MarketRiskEngine()
        risk_output = risk_engine.calculate(
            dna_dict=dna.to_dict(),
            population_summary=population_summary_dict,
            enriched_segments=enriched_segments,
        )

        return format_response({
            "status": "success",
            "metric_name": "Consumer Adoption Simulator",
            "summary": (
                f"Simulated {total_pop:,} consumers across {len(clusters)} psychographic segments. "
                f"Average purchase intent: {avg_intent:.1f}/100. "
                f"Average conversion probability: {avg_conversion:.1%}. "
                f"Dominant channel: {dominant_channel}."
            ),
            "results": {
                "population_summary": {
                    "total_consumers":            total_pop,
                    "num_psychographic_segments": len(clusters),
                    "avg_purchase_intent":        avg_intent,
                    "avg_conversion_probability": avg_conversion,
                    "avg_trust_score":            avg_trust,
                    "avg_emotional_resonance":    avg_resonance,
                    "avg_resistance_index":       avg_resistance,
                    "dominant_channel":           dominant_channel,
                    "channel_distribution":       channel_votes,
                },
                "market_dna":                  dna.to_dict(),
                "psychographic_segments":      enriched_segments,
                "high_intent_segments":        high_intent_segments,
                "critical_resistance_segments":critical_barriers,
                "data_completeness":           dna.data_completeness,
                "completeness_score":          dna.completeness_score,
                # ── AI Insight Layer ──────────────────────────────────────────
                "insights":            insight_output.get("insights", {}),
                "executive_narrative": insight_output.get("executive_narrative", {}),
                "action_plan":         insight_output.get("action_plan", []),
                "key_opportunities":   insight_output.get("key_opportunities", []),
                "key_risks":           insight_output.get("key_risks", []),
                # ── Confidence & Validation ───────────────────────────────────
                "simulation_confidence": confidence_output,
                # ── Scenario Testing ──────────────────────────────────────────
                "scenario_testing":    scenario_output,
                # ── Market Stress Testing ─────────────────────────────────────
                "stress_testing":      stress_test_output,
                # ── Segment Stability ─────────────────────────────────────────
                "segment_stability":   stability_output,
                # ── Market Risk Assessment ────────────────────────────────────
                "market_risk":         risk_output,
                "data_scope":          build_data_scope(scope_meta, kw_meta),
                "scope":               scope_meta,
                "engine_cache_key":    cache_key,
            },
            "page_scope": {
                "page_id": "consumer_adoption",
                "keyword_scope": "global",
                "product_scope": "filtered",
                "category_dependency": True,
                "methodology": (
                    "Simulation inputs from category-scoped engine cache: "
                    "demand/SIEI/demand_velocity use global Magnet; "
                    "HHI/revenue_momentum/BSR/price use scoped BlackBox."
                ),
            },
        })

    except Exception as exc:
        logger.error("Consumer Adoption Simulator error: %s", str(exc), exc_info=True)
        return format_response({
            "status": "error",
            "message": f"Simulation failed: {str(exc)}",
        })
